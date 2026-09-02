use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Métadonnées renvoyées au frontend après copie dans le dossier de données.
/// L'enregistrement en base est fait côté TypeScript, qui détient déjà la
/// connexion SQL via `tauri-plugin-sql`.
#[derive(Debug, Serialize)]
pub struct ImportedAsset {
    pub file_name: String,
    pub file_type: String,
    /// Chemin relatif au répertoire de données, ex. `media/<hash>.pdf`.
    pub local_path: String,
    pub file_size: u64,
    pub content_hash: String,
}

/// Taille maximale acceptée : au-delà, la copie et le hachage bloqueraient
/// l'interface, et un canvas n'a pas vocation à héberger des archives.
const MAX_FILE_SIZE: u64 = 256 * 1024 * 1024;

/// Types acceptés, indexés par extension en minuscules.
fn mime_for_extension(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

/// SHA-256 du contenu, lu par blocs : un PDF de cours peut peser des centaines
/// de mégaoctets, on évite de le charger entièrement en mémoire.
fn hash_file(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| format!("ouverture impossible : {e}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("lecture impossible : {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("répertoire de données introuvable : {e}"))?
        .join("media");
    fs::create_dir_all(&dir).map_err(|e| format!("création du dossier média : {e}"))?;
    Ok(dir)
}

/// Copie un fichier local dans `app_data_dir/media/` et renvoie ses métadonnées.
///
/// Le nom de destination est le hachage du contenu : deux imports du même
/// fichier retombent sur la même copie, sans duplication sur le disque.
#[tauri::command]
pub async fn import_canvas_asset(
    app: AppHandle,
    source_path: String,
) -> Result<ImportedAsset, String> {
    let source = PathBuf::from(&source_path);

    let metadata = fs::metadata(&source).map_err(|e| format!("fichier illisible : {e}"))?;
    if !metadata.is_file() {
        return Err("le chemin ne désigne pas un fichier".into());
    }
    let file_size = metadata.len();
    if file_size > MAX_FILE_SIZE {
        return Err(format!(
            "fichier trop volumineux ({} Mo, maximum {} Mo)",
            file_size / (1024 * 1024),
            MAX_FILE_SIZE / (1024 * 1024)
        ));
    }

    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let file_type = mime_for_extension(&extension)
        .ok_or_else(|| format!("format non pris en charge : « {extension} »"))?;

    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document")
        .to_string();

    let content_hash = hash_file(&source)?;
    let target_name = format!("{content_hash}.{extension}");
    let target = media_dir(&app)?.join(&target_name);

    // Un fichier déjà présent sous ce nom a, par construction, le même contenu :
    // recopier serait du travail inutile.
    if !target.exists() {
        fs::copy(&source, &target).map_err(|e| format!("copie impossible : {e}"))?;
    }

    Ok(ImportedAsset {
        file_name,
        file_type: file_type.to_string(),
        local_path: format!("media/{target_name}"),
        file_size,
        content_hash,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, contents: &[u8]) -> PathBuf {
        let path = std::env::temp_dir().join(name);
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(contents).unwrap();
        path
    }

    #[test]
    fn accepte_les_formats_attendus() {
        assert_eq!(mime_for_extension("png"), Some("image/png"));
        assert_eq!(mime_for_extension("jpeg"), Some("image/jpeg"));
        assert_eq!(mime_for_extension("pdf"), Some("application/pdf"));
    }

    #[test]
    fn rejette_les_autres_formats() {
        assert_eq!(mime_for_extension("exe"), None);
        assert_eq!(mime_for_extension("zip"), None);
        assert_eq!(mime_for_extension(""), None);
    }

    #[test]
    fn hache_le_contenu_pas_le_nom() {
        // Deux fichiers de noms différents mais de contenu identique doivent
        // retomber sur le même hachage : c'est ce qui fonde la déduplication.
        let a = temp_file("archipel_test_a.txt", b"contenu identique");
        let b = temp_file("archipel_test_b.txt", b"contenu identique");
        let c = temp_file("archipel_test_c.txt", b"contenu different");

        assert_eq!(hash_file(&a).unwrap(), hash_file(&b).unwrap());
        assert_ne!(hash_file(&a).unwrap(), hash_file(&c).unwrap());

        // SHA-256 rendu en hexadécimal : 64 caractères, sûrs dans un nom de
        // fichier sur les trois systèmes cibles.
        assert_eq!(hash_file(&a).unwrap().len(), 64);

        for path in [a, b, c] {
            let _ = fs::remove_file(path);
        }
    }

    #[test]
    fn hache_par_blocs_sans_tout_charger() {
        // Contenu plus grand que le tampon de 64 Kio, pour couvrir la boucle.
        let big = temp_file("archipel_test_big.bin", &vec![7u8; 200 * 1024]);
        assert_eq!(hash_file(&big).unwrap().len(), 64);
        let _ = fs::remove_file(big);
    }
}
