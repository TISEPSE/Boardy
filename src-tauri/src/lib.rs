mod db;
mod github;
mod media;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Base SQLite locale, résolue dans le répertoire de données de l'application.
const DB_URL: &str = "sqlite:boardy.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "schéma initial : arborescence, canvas, médias, recherche",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "support du type de nœud kanban",
            sql: include_str!("../migrations/002_kanban.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "types de nœuds GitHub",
            sql: include_str!("../migrations/003_github.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .setup(|app| {
            // Pool à connexion unique pour les transactions ; le plugin SQL
            // garde les `select` / `execute` unitaires (cf. src/db.rs).
            let pool = db::init(app.handle())?;
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            media::import_canvas_asset,
            db::db_transaction,
            github::github_save_token,
            github::github_forget_token,
            github::github_account,
            github::github_profile,
            github::github_repository,
            github::github_latest_release
        ])
        .run(tauri::generate_context!())
        .expect("échec du démarrage de Boardy");
}
