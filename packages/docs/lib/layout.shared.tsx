import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';
import { i18n } from './i18n';
import { DOCS_BASE_PATH } from './locales.mjs';

export function baseOptions(lang?: string): BaseLayoutProps {
  // Respect hideLocale: the default locale (en) has no path prefix, so its
  // nav title links to the docs root, not /en.
  const localePrefix =
    lang && lang !== i18n.defaultLanguage ? `/${lang}` : '';

  return {
    nav: {
      // JSX supported. Static export does not rewrite asset URLs, so the
      // basePath has to be baked into the logo src.
      title: (
        <span className="flex items-center gap-2">
          <img
            src={`${DOCS_BASE_PATH}/rhodes-island-mark.png`}
            alt={appName}
            className="size-6"
          />
          {appName}
        </span>
      ),
      url: `${localePrefix}/`,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    // Link back to the live product, shown prominently in the top navbar.
    links: [
      {
        text: 'Live Demo',
        url: 'https://open.maic.chat',
        external: true,
      },
    ],
    // enable the locale switcher in the navbar
    i18n: true,
  };
}
