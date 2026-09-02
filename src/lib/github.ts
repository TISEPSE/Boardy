import { invoke } from '@tauri-apps/api/core';

/**
 * Passerelle vers les commandes Rust de `src-tauri/src/github.rs`.
 *
 * Le jeton n'apparaît jamais ici : il est écrit une fois dans le trousseau du
 * système par `saveToken`, puis relu côté Rust à chaque appel. Le contexte
 * JavaScript ne le détient donc à aucun moment, et les requêtes partent du
 * processus natif — ce qui évite aussi le CORS de l'API GitHub.
 */

export interface GithubAccount {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Requêtes restantes sur l'heure glissante, tel que renvoyé par GitHub. */
  rateRemaining: number | null;
  rateLimit: number | null;
}

export interface GithubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  followers: number;
  publicRepos: number;
  stars: number;
  contributionsTotal: number;
  /** Une valeur par semaine sur l'année écoulée, la plus ancienne en premier. */
  contributionsByWeek: number[];
}

export interface GithubLanguage {
  name: string;
  bytes: number;
}

export interface GithubContributor {
  login: string;
  avatarUrl: string;
}

export interface GithubRepository {
  owner: string;
  name: string;
  description: string | null;
  topics: string[];
  isPrivate: boolean;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  pushedAt: string | null;
  htmlUrl: string;
  languages: GithubLanguage[];
  contributors: GithubContributor[];
  contributorsTruncated: boolean;
}

export interface ReleaseEntry {
  kind: 'added' | 'fixed';
  text: string;
}

export interface GithubRelease {
  tagName: string;
  name: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  entries: ReleaseEntry[];
}

/** Valide le jeton auprès de GitHub avant de l'écrire dans le trousseau. */
export function saveToken(token: string): Promise<GithubAccount> {
  return invoke<GithubAccount>('github_save_token', { token });
}

export function forgetToken(): Promise<void> {
  return invoke<void>('github_forget_token');
}

/** `null` quand aucun jeton n'est enregistré — un état normal, pas une panne. */
export function getAccount(): Promise<GithubAccount | null> {
  return invoke<GithubAccount | null>('github_account');
}

/** Sans `login`, renvoie le profil du porteur du jeton. */
export function fetchProfile(login?: string): Promise<GithubProfile> {
  return invoke<GithubProfile>('github_profile', { login: login ?? null });
}

export function fetchRepository(
  owner: string,
  name: string,
): Promise<GithubRepository> {
  return invoke<GithubRepository>('github_repository', { owner, name });
}

/** `null` quand le dépôt n'a publié aucune release. */
export function fetchLatestRelease(
  owner: string,
  name: string,
): Promise<GithubRelease | null> {
  return invoke<GithubRelease | null>('github_latest_release', { owner, name });
}

/**
 * Découpe `owner/name`, en tolérant une URL complète collée depuis le
 * navigateur. Renvoie `null` si la saisie ne désigne pas un dépôt.
 */
export function parseRepoReference(
  input: string,
): { owner: string; name: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, name] = segments;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;
  return { owner, name };
}
