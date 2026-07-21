/** sessionStorage key SignupPage sets before a Google OAuth redirect, so AppLayout can record
 * terms acceptance once the redirect lands the user back signed in. Only the Google-signup path
 * needs this indirection — the email path stays on this tab and calls useAcceptTerms directly. */
export const PENDING_TERMS_ACCEPTANCE_KEY = 'wg_pending_terms_acceptance';
