//! Intégration GitHub en lecture seule.
//!
//! Tous les appels réseau partent d'ici, jamais du webview : le jeton reste
//! confiné au processus Rust et au trousseau du système, et n'apparaît donc ni
//! dans `data_json`, ni dans le contexte JavaScript, ni dans les outils de
//! développement. Le frontend ne manipule que des données déjà agrégées.

use std::sync::OnceLock;

use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Coordonnées de l'entrée dans le trousseau (Secret Service sur Linux).
const KEYRING_SERVICE: &str = "app.boardy.desktop";
const KEYRING_ACCOUNT: &str = "github-read-token";

const REST_ROOT: &str = "https://api.github.com";
const GRAPHQL_URL: &str = "https://api.github.com/graphql";
/// GitHub rejette toute requête sans `User-Agent`.
const USER_AGENT_VALUE: &str = "Boardy-Desktop";

// -----------------------------------------------------------------------------
// Client HTTP
// -----------------------------------------------------------------------------

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .gzip(true)
            .build()
            .expect("construction du client HTTP")
    })
}

fn entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("trousseau inaccessible : {error}"))
}

/// Lit le jeton, ou explique pourquoi il n'y en a pas.
fn read_token() -> Result<String, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => {
            Err("aucun jeton GitHub enregistré — ajoute-le dans Paramètres › GitHub".into())
        }
        Err(error) => Err(format!("lecture du trousseau impossible : {error}")),
    }
}

fn headers(token: &str, accept: &str) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    map.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    map.insert(
        ACCEPT,
        HeaderValue::from_str(accept).map_err(|error| error.to_string())?,
    );
    let mut auth = HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| "jeton invalide : caractères non autorisés dans un en-tête".to_string())?;
    // Le jeton ne doit pas ressortir dans un `Debug` de la requête.
    auth.set_sensitive(true);
    map.insert(AUTHORIZATION, auth);
    Ok(map)
}

/// Traduit les statuts d'erreur de l'API en messages actionnables.
async fn check(response: Response, context: &str) -> Result<Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let hint = match status {
        StatusCode::UNAUTHORIZED => "jeton refusé — il est peut-être révoqué ou expiré".into(),
        StatusCode::FORBIDDEN => {
            // 403 sert à la fois au quota épuisé et aux permissions manquantes.
            let remaining = response
                .headers()
                .get("x-ratelimit-remaining")
                .and_then(|value| value.to_str().ok())
                .unwrap_or("?");
            if remaining == "0" {
                "quota de requêtes GitHub épuisé — réessaie dans une heure".into()
            } else {
                "accès refusé : le jeton n'a pas la portée nécessaire".into()
            }
        }
        StatusCode::NOT_FOUND => "introuvable, ou invisible avec ce jeton".into(),
        other => format!("réponse inattendue de GitHub ({other})"),
    };
    Err(format!("{context} : {hint}"))
}

async fn get_json<T: for<'de> Deserialize<'de>>(path: &str, context: &str) -> Result<T, String> {
    let token = read_token()?;
    let response = client()
        .get(format!("{REST_ROOT}{path}"))
        .headers(headers(&token, "application/vnd.github+json")?)
        .send()
        .await
        .map_err(|error| format!("{context} : {error}"))?;
    check(response, context)
        .await?
        .json::<T>()
        .await
        .map_err(|error| format!("{context} : réponse illisible ({error})"))
}

// -----------------------------------------------------------------------------
// Compte
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubAccount {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    /// Requêtes restantes sur l'heure glissante, tel que renvoyé par GitHub.
    pub rate_remaining: Option<u32>,
    pub rate_limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct RestUser {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

/// Valide un jeton en interrogeant `/user`, puis l'enregistre dans le trousseau.
///
/// L'écriture n'a lieu qu'après validation : un jeton fautif ne remplace jamais
/// un jeton qui fonctionne.
#[tauri::command]
pub async fn github_save_token(token: String) -> Result<GithubAccount, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("jeton vide".into());
    }

    let response = client()
        .get(format!("{REST_ROOT}/user"))
        .headers(headers(&token, "application/vnd.github+json")?)
        .send()
        .await
        .map_err(|error| format!("connexion à GitHub impossible : {error}"))?;

    let rate_remaining = header_u32(&response, "x-ratelimit-remaining");
    let rate_limit = header_u32(&response, "x-ratelimit-limit");
    let user: RestUser = check(response, "vérification du jeton")
        .await?
        .json()
        .await
        .map_err(|error| format!("réponse illisible : {error}"))?;

    entry()?
        .set_password(&token)
        .map_err(|error| format!("écriture dans le trousseau impossible : {error}"))?;

    Ok(GithubAccount {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        rate_remaining,
        rate_limit,
    })
}

#[tauri::command]
pub async fn github_forget_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("suppression du jeton impossible : {error}")),
    }
}

/// Compte associé au jeton enregistré, ou `None` si aucun jeton n'est présent.
///
/// Une erreur n'est remontée que si un jeton existe mais ne fonctionne plus :
/// l'absence de jeton est un état normal, pas une panne.
#[tauri::command]
pub async fn github_account() -> Result<Option<GithubAccount>, String> {
    let token = match entry()?.get_password() {
        Ok(token) => token,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => return Err(format!("lecture du trousseau impossible : {error}")),
    };

    let response = client()
        .get(format!("{REST_ROOT}/user"))
        .headers(headers(&token, "application/vnd.github+json")?)
        .send()
        .await
        .map_err(|error| format!("connexion à GitHub impossible : {error}"))?;

    let rate_remaining = header_u32(&response, "x-ratelimit-remaining");
    let rate_limit = header_u32(&response, "x-ratelimit-limit");
    let user: RestUser = check(response, "lecture du compte")
        .await?
        .json()
        .await
        .map_err(|error| format!("réponse illisible : {error}"))?;

    Ok(Some(GithubAccount {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        rate_remaining,
        rate_limit,
    }))
}

fn header_u32(response: &Response, name: &str) -> Option<u32> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

// -----------------------------------------------------------------------------
// Profil
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubProfile {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub bio: Option<String>,
    pub followers: u32,
    pub public_repos: u32,
    /// Somme des étoiles reçues par les dépôts possédés (100 premiers).
    pub stars: u32,
    pub contributions_total: u32,
    /// Une valeur par semaine sur l'année écoulée, la plus ancienne en premier.
    pub contributions_by_week: Vec<u32>,
}

/// Le calendrier de contributions n'existe pas dans l'API REST : seule la
/// couche GraphQL l'expose. Une requête suffit alors pour tout le reste du
/// profil, au lieu de trois appels REST.
const PROFILE_QUERY: &str = r#"
query($login: String!) {
  user(login: $login) {
    login
    name
    avatarUrl
    bio
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes { stargazerCount }
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount } }
      }
    }
  }
}"#;

#[derive(Debug, Deserialize)]
struct GraphQlEnvelope<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct ProfileData {
    user: Option<GqlUser>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlUser {
    login: String,
    name: Option<String>,
    avatar_url: String,
    bio: Option<String>,
    followers: GqlTotal,
    repositories: GqlRepositories,
    contributions_collection: GqlContributions,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlTotal {
    total_count: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlRepositories {
    total_count: u32,
    nodes: Vec<GqlRepoStars>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlRepoStars {
    stargazer_count: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlContributions {
    contribution_calendar: GqlCalendar,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlCalendar {
    total_contributions: u32,
    weeks: Vec<GqlWeek>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlWeek {
    contribution_days: Vec<GqlDay>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlDay {
    contribution_count: u32,
}

#[tauri::command]
pub async fn github_profile(login: Option<String>) -> Result<GithubProfile, String> {
    // Sans login explicite, on affiche le profil du porteur du jeton.
    let login = match login.map(|value| value.trim().to_string()) {
        Some(value) if !value.is_empty() => value,
        _ => {
            let user: RestUser = get_json("/user", "lecture du compte").await?;
            user.login
        }
    };

    let token = read_token()?;
    let response = client()
        .post(GRAPHQL_URL)
        .headers(headers(&token, "application/json")?)
        .json(&json!({ "query": PROFILE_QUERY, "variables": { "login": login } }))
        .send()
        .await
        .map_err(|error| format!("lecture du profil : {error}"))?;

    let envelope: GraphQlEnvelope<ProfileData> = check(response, "lecture du profil")
        .await?
        .json()
        .await
        .map_err(|error| format!("lecture du profil : réponse illisible ({error})"))?;

    if let Some(first) = envelope.errors.first() {
        return Err(format!("lecture du profil : {}", first.message));
    }
    let user = envelope
        .data
        .and_then(|data| data.user)
        .ok_or_else(|| format!("profil « {login} » introuvable"))?;

    let calendar = user.contributions_collection.contribution_calendar;

    Ok(GithubProfile {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        followers: user.followers.total_count,
        public_repos: user.repositories.total_count,
        stars: user
            .repositories
            .nodes
            .iter()
            .map(|repo| repo.stargazer_count)
            .sum(),
        contributions_total: calendar.total_contributions,
        contributions_by_week: calendar
            .weeks
            .iter()
            .map(|week| week.contribution_days.iter().map(|day| day.contribution_count).sum())
            .collect(),
    })
}

// -----------------------------------------------------------------------------
// Dépôt
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubLanguage {
    pub name: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubContributor {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepository {
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub topics: Vec<String>,
    pub is_private: bool,
    pub stars: u32,
    pub forks: u32,
    pub open_issues: u32,
    pub license: Option<String>,
    pub pushed_at: Option<String>,
    pub html_url: String,
    pub languages: Vec<GithubLanguage>,
    pub contributors: Vec<GithubContributor>,
    /// `true` si la liste des contributeurs a été tronquée à 100.
    pub contributors_truncated: bool,
}

#[derive(Debug, Deserialize)]
struct RestRepo {
    name: String,
    owner: RestOwner,
    description: Option<String>,
    #[serde(default)]
    topics: Vec<String>,
    private: bool,
    stargazers_count: u32,
    forks_count: u32,
    open_issues_count: u32,
    license: Option<RestLicense>,
    pushed_at: Option<String>,
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct RestOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RestLicense {
    spdx_id: Option<String>,
    name: String,
}

#[derive(Debug, Deserialize)]
struct RestContributor {
    login: String,
    avatar_url: String,
}

#[tauri::command]
pub async fn github_repository(owner: String, name: String) -> Result<GithubRepository, String> {
    let base = format!("/repos/{owner}/{name}");

    let repo: RestRepo = get_json(&base, "lecture du dépôt").await?;

    // La répartition des langages et les contributeurs sont deux ressources
    // distinctes ; leur échec ne doit pas priver la tuile du reste des données.
    let languages = get_json::<std::collections::HashMap<String, u64>>(
        &format!("{base}/languages"),
        "lecture des langages",
    )
    .await
    .unwrap_or_default();

    let contributors = get_json::<Vec<RestContributor>>(
        &format!("{base}/contributors?per_page=100"),
        "lecture des contributeurs",
    )
    .await
    .unwrap_or_default();

    let mut languages: Vec<GithubLanguage> = languages
        .into_iter()
        .map(|(name, bytes)| GithubLanguage { name, bytes })
        .collect();
    // Le langage dominant en premier : c'est l'ordre d'affichage de la tuile.
    languages.sort_by_key(|language| std::cmp::Reverse(language.bytes));

    Ok(GithubRepository {
        owner: repo.owner.login,
        name: repo.name,
        description: repo.description,
        topics: repo.topics,
        is_private: repo.private,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        license: repo
            .license
            .map(|license| license.spdx_id.unwrap_or(license.name)),
        pushed_at: repo.pushed_at,
        html_url: repo.html_url,
        languages,
        contributors_truncated: contributors.len() == 100,
        contributors: contributors
            .into_iter()
            .map(|contributor| GithubContributor {
                login: contributor.login,
                avatar_url: contributor.avatar_url,
            })
            .collect(),
    })
}

// -----------------------------------------------------------------------------
// Release
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseEntryKind {
    Added,
    Fixed,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseEntry {
    pub kind: ReleaseEntryKind,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub html_url: String,
    pub entries: Vec<ReleaseEntry>,
}

#[derive(Debug, Deserialize)]
struct RestRelease {
    tag_name: String,
    name: Option<String>,
    published_at: Option<String>,
    html_url: String,
    body: Option<String>,
}

/// Mots qui font basculer une ligne de notes de version du côté « correctif ».
const FIX_MARKERS: [&str; 6] = ["fix", "correctif", "corrige", "bug", "patch", "hotfix"];

/// Découpe le corps Markdown d'une release en éléments de liste classés.
///
/// GitHub ne structure pas ce texte : il est libre. On ne retient donc que les
/// puces, et on les range en correctifs ou en ajouts selon leur vocabulaire —
/// une heuristique assumée, qui vaut mieux qu'un pavé Markdown brut dans une
/// tuile de 320 px.
fn parse_release_body(body: &str) -> Vec<ReleaseEntry> {
    body.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let text = trimmed
                .strip_prefix("- ")
                .or_else(|| trimmed.strip_prefix("* "))
                .or_else(|| trimmed.strip_prefix("+ "))?
                .trim();
            if text.is_empty() {
                return None;
            }
            let lowered = text.to_lowercase();
            let kind = if FIX_MARKERS.iter().any(|marker| lowered.contains(marker)) {
                ReleaseEntryKind::Fixed
            } else {
                ReleaseEntryKind::Added
            };
            Some(ReleaseEntry {
                kind,
                text: text.to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn github_latest_release(
    owner: String,
    name: String,
) -> Result<Option<GithubRelease>, String> {
    let token = read_token()?;
    let response = client()
        .get(format!("{REST_ROOT}/repos/{owner}/{name}/releases/latest"))
        .headers(headers(&token, "application/vnd.github+json")?)
        .send()
        .await
        .map_err(|error| format!("lecture de la release : {error}"))?;

    // Un dépôt sans release répond 404 : ce n'est pas une erreur à afficher.
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let release: RestRelease = check(response, "lecture de la release")
        .await?
        .json()
        .await
        .map_err(|error| format!("lecture de la release : réponse illisible ({error})"))?;

    Ok(Some(GithubRelease {
        entries: parse_release_body(release.body.as_deref().unwrap_or_default()),
        tag_name: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        html_url: release.html_url,
    }))
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_puces_sont_classees_par_vocabulaire() {
        let body = "## Notes\n- Export Markdown d'un tableau\n* Correctif : perte de focus\n+ Recherche accent-insensible\ntexte hors liste\n";
        let entries = parse_release_body(body);

        assert_eq!(
            entries,
            vec![
                ReleaseEntry {
                    kind: ReleaseEntryKind::Added,
                    text: "Export Markdown d'un tableau".into()
                },
                ReleaseEntry {
                    kind: ReleaseEntryKind::Fixed,
                    text: "Correctif : perte de focus".into()
                },
                ReleaseEntry {
                    kind: ReleaseEntryKind::Added,
                    text: "Recherche accent-insensible".into()
                },
            ]
        );
    }

    #[test]
    fn un_corps_vide_ne_produit_aucune_entree() {
        assert!(parse_release_body("").is_empty());
        assert!(parse_release_body("Rien que du texte.\n\nEt un paragraphe.").is_empty());
    }

    #[test]
    fn le_jeton_est_marque_sensible_dans_les_en_tetes() {
        let map = headers("secret-token", "application/json").expect("en-têtes");
        let auth = map.get(AUTHORIZATION).expect("en-tête Authorization");
        // `is_sensitive` empêche la valeur d'apparaître dans les traces de debug.
        assert!(auth.is_sensitive());
        assert_eq!(format!("{auth:?}"), "Sensitive");
    }
}
