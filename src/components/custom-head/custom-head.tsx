import { NextSeo } from 'next-seo'
import NextHead from 'next/head'

function CustomHead({
  title = 'strava—x',
  image = { url: 'https://strava—x/behlockxyz.svg' },
  description = '',
  keywords = [] as string[],
}) {
  return (
    <>
      <NextHead>
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />

        <meta name="robots" content={process.env.NODE_ENV !== 'development' ? 'index,follow' : 'noindex,nofollow'} />
        <meta name="googlebot" content={process.env.NODE_ENV !== 'development' ? 'index,follow' : 'noindex,nofollow'} />

        <meta name="keywords" content={keywords && keywords.length ? keywords.join(',') : ''} />
        <meta name="author" content="Walid Behlock" />
        <meta name="referrer" content="no-referrer" />
        <meta name="format-detection" content="telephone=no" />
        <meta httpEquiv="x-dns-prefetch-control" content="off" />
        <meta httpEquiv="Window-Target" content="_value" />
        <meta name="geo.region" content="US" />

        {/* START FAVICON */}
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#000000" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/favicon.ico" />

        <title>{title}</title>
      </NextHead>
      <NextSeo
        title={title}
        description={description}
        openGraph={{
          title,
          description,
          type: 'website',
          locale: 'en_UK',
          images: [
            {
              url: image.url,
              width: 1200,
              height: 630,
              alt: title,
            },
          ],
          defaultImageWidth: 1200,
          defaultImageHeight: 630,
          site_name: '',
        }}
      />
    </>
  )
}

export default CustomHead
