use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::query::Query;
use sqlx::sqlite::{SqliteArguments, SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Sqlite, SqlitePool};
use tauri::{AppHandle, Manager, State};

/// Même fichier que celui résolu par `tauri-plugin-sql` pour `sqlite:boardy.db`
/// (cf. `path_mapper` : `app_config_dir()` + nom de fichier).
const DB_FILE: &str = "boardy.db";

/// Pool dédié aux écritures transactionnelles.
///
/// `tauri-plugin-sql` n'expose pas de transaction : chaque `execute` emprunte
/// une connexion quelconque de son pool (10 par défaut). Un `BEGIN IMMEDIATE`
/// envoyé par IPC ouvre donc la transaction sur une connexion qui retourne
/// aussitôt au pool ; les instructions suivantes tombent sur d'autres
/// connexions et échouent en `database is locked (5)`, et le `COMMIT` n'atteint
/// jamais la bonne — le verrou d'écriture WAL reste tenu jusqu'à la fin du
/// process.
///
/// Ce pool est limité à **une connexion** et passe par `sqlx::Transaction`, ce
/// qui garantit BEGIN / instructions / COMMIT sur la même connexion.
pub struct AppDb {
    pool: SqlitePool,
}

/// Une instruction de la transaction, telle qu'envoyée par `src/lib/db.ts`.
#[derive(Debug, Deserialize)]
pub struct Statement {
    sql: String,
    #[serde(default)]
    params: Vec<JsonValue>,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("répertoire de configuration introuvable : {error}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("création de {} impossible : {error}", dir.display()))?;
    Ok(dir.join(DB_FILE))
}

/// Ouvre le pool transactionnel. Appelé une fois au démarrage.
pub fn init(app: &AppHandle) -> Result<AppDb, String> {
    let path = db_path(app)?;
    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        // Le pool de `tauri-plugin-sql` écrit sur le même fichier : on attend
        // plutôt que d'échouer si l'un de ses `execute` tient le verrou.
        .busy_timeout(Duration::from_secs(10));

    let pool = tauri::async_runtime::block_on(
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options),
    )
    .map_err(|error| format!("ouverture de {} impossible : {error}", path.display()))?;

    Ok(AppDb { pool })
}

/// Reproduit la conversion JSON -> SQLite de `tauri-plugin-sql`, pour que les
/// valeurs écrites en transaction soient typées comme celles écrites par
/// `execute`.
fn bind<'q>(
    query: Query<'q, Sqlite, SqliteArguments<'q>>,
    value: &JsonValue,
) -> Query<'q, Sqlite, SqliteArguments<'q>> {
    if value.is_null() {
        query.bind(None::<JsonValue>)
    } else if let Some(text) = value.as_str() {
        query.bind(text.to_owned())
    } else if let Some(number) = value.as_f64() {
        query.bind(number)
    } else {
        query.bind(value.clone())
    }
}

/// Applique une suite d'écritures dans une transaction unique.
///
/// En cas d'erreur, `tx` est abandonné : sqlx émet le `ROLLBACK` au drop, sur
/// la connexion qui détient la transaction.
#[tauri::command]
pub async fn db_transaction(
    db: State<'_, AppDb>,
    statements: Vec<Statement>,
) -> Result<(), String> {
    if statements.is_empty() {
        return Ok(());
    }

    let mut tx = db
        .pool
        .begin()
        .await
        .map_err(|error| format!("ouverture de la transaction impossible : {error}"))?;

    for statement in &statements {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.params {
            query = bind(query, value);
        }
        query
            .execute(&mut *tx)
            .await
            .map_err(|error| error.to_string())?;
    }

    tx.commit()
        .await
        .map_err(|error| format!("commit impossible : {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Executor;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Base jetable, dans le dossier temporaire du système.
    struct TempDb(PathBuf);

    impl TempDb {
        fn new(tag: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(std::env::temp_dir().join(format!("archipel-test-{tag}-{nanos}.db")))
        }

        fn options(&self) -> SqliteConnectOptions {
            SqliteConnectOptions::new()
                .filename(&self.0)
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal)
                // Court : un verrou tenu doit faire échouer le test vite.
                .busy_timeout(Duration::from_millis(300))
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", self.0.display()));
            }
        }
    }

    async fn pool(db: &TempDb, max_connections: u32) -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_with(db.options())
            .await
            .unwrap();
        pool.execute("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)")
            .await
            .unwrap();
        pool
    }

    /// Reproduit le bug : un `BEGIN IMMEDIATE` posé sur une connexion du pool
    /// bloque toute écriture servie par une autre connexion, et le verrou
    /// survit tant que la première n'est pas rendue. C'est exactement ce que
    /// faisait `transaction()` en enchaînant des `execute` IPC indépendants.
    #[test]
    fn begin_sur_une_connexion_bloque_les_autres() {
        let db = TempDb::new("multi");
        tauri::async_runtime::block_on(async {
            let pool = pool(&db, 4).await;

            // Connexion A, sortie du pool, ouvre la transaction en écriture.
            let mut held = pool.acquire().await.unwrap();
            held.execute("BEGIN IMMEDIATE").await.unwrap();

            // L'instruction suivante est servie par une autre connexion.
            let error = pool
                .execute("INSERT INTO t (id) VALUES (1)")
                .await
                .expect_err("l'écriture aurait dû être refusée");
            assert!(
                error.to_string().contains("locked"),
                "erreur inattendue : {error}"
            );

            // Le COMMIT parti sur une troisième connexion ne valide rien.
            assert!(pool.execute("COMMIT").await.is_err());
        });
    }

    /// Le correctif : une transaction sqlx sur un pool à connexion unique
    /// valide bien, et ne laisse aucun verrou derrière elle.
    #[test]
    fn la_transaction_valide_et_libere_le_verrou() {
        let db = TempDb::new("mono");
        tauri::async_runtime::block_on(async {
            let pool = pool(&db, 1).await;

            let mut tx = pool.begin().await.unwrap();
            for id in 1..=3 {
                sqlx::query("INSERT INTO t (id) VALUES (?)")
                    .bind(id)
                    .execute(&mut *tx)
                    .await
                    .unwrap();
            }
            tx.commit().await.unwrap();

            let (count,): (i64,) = sqlx::query_as("SELECT count(*) FROM t")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 3);

            // Un client extérieur doit pouvoir prendre le verrou d'écriture.
            let autre = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(db.options())
                .await
                .unwrap();
            autre
                .execute("BEGIN IMMEDIATE")
                .await
                .expect("le verrou d'écriture est resté pris");
            autre.execute("ROLLBACK").await.unwrap();
        });
    }

    /// Une instruction fautive défait la transaction et rend le verrou.
    #[test]
    fn une_erreur_annule_tout_et_rend_le_verrou() {
        let db = TempDb::new("rollback");
        tauri::async_runtime::block_on(async {
            let pool = pool(&db, 1).await;

            let mut tx = pool.begin().await.unwrap();
            sqlx::query("INSERT INTO t (id) VALUES (1)")
                .execute(&mut *tx)
                .await
                .unwrap();
            // Doublon de clé primaire : la transaction doit être abandonnée.
            assert!(sqlx::query("INSERT INTO t (id) VALUES (1)")
                .execute(&mut *tx)
                .await
                .is_err());
            drop(tx);

            let (count,): (i64,) = sqlx::query_as("SELECT count(*) FROM t")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 0, "l'écriture partielle aurait dû être annulée");

            let autre = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(db.options())
                .await
                .unwrap();
            autre
                .execute("BEGIN IMMEDIATE")
                .await
                .expect("le verrou d'écriture est resté pris");
            autre.execute("ROLLBACK").await.unwrap();
        });
    }
}
