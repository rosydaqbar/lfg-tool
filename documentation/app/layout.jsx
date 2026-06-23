import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'LFG Tool Documentation',
    template: '%s - LFG Tool Documentation'
  },
  description:
    'Documentation for the Discord LFG voice bot, dashboard, setup flow, and deployment model.'
}

const repositoryUrl = 'https://github.com/rosydaqbar/lfg-tool'
const docsRepositoryBase = `${repositoryUrl}/tree/main/documentation`

const navbar = (
  <Navbar
    logo={<strong>LFG Tool Docs</strong>}
    logoLink="/"
    projectLink={repositoryUrl}
  />
)
const footer = (
  <Footer>
    CC0 {new Date().getFullYear()} - LFG Tool documentation.
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase={docsRepositoryBase}
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
