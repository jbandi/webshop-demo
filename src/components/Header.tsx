import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 shadow-[0_4px_18px_rgba(17,24,39,0.06)]">
      <div className="header-accent" />
      <nav className="page-wrap flex flex-wrap items-center gap-x-4 gap-y-3 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="brand-lockup inline-flex items-center gap-3 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-2 text-sm text-[var(--sea-ink)] no-underline sm:px-4"
          >
            <span className="brand-mark" aria-hidden="true" />
            <span>
              <strong className="block text-[0.95rem] leading-none">
                Demo Web Shop
              </strong>
              <span className="mt-1 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--sea-ink-soft)]">
                Schweizer Grosshandel
              </span>
            </span>
          </Link>
        </h2>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0 sm:gap-2">
          <a
            href="https://web.transgourmet.ch/de/webshop"
            target="_blank"
            rel="noreferrer"
            className="header-icon hidden rounded-md border border-transparent p-2 text-[var(--sea-ink-soft)] sm:block"
          >
            <span className="sr-only">Transgourmet-Webshop oeffnen</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
              <path
                fill="currentColor"
                d="M4 5h16v2H4V5zm2 4h12v10H6V9zm4 2v2h4v-2h-4z"
              />
            </svg>
          </a>
        </div>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--line)] pt-3 text-sm font-semibold sm:order-2 sm:w-auto sm:border-t-0 sm:pt-0">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Shop
          </Link>
          <Link
            to="/about"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Hinweise
          </Link>
        </div>
      </nav>
    </header>
  )
}
