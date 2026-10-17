/** Public address of the deployed site, used in emailed links. Set SITE_URL in Vercel. */
export const DEFAULT_SITE_URL = 'https://usc.syntaxure.dev'

export function siteUrl(): string {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}
