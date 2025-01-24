import ThemeProvider from '@/components/theme-provider'

function Layout({ children = null }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <main className="flex flex-col space-y-4 p-8">{children}</main>
    </ThemeProvider>
  )
}

export default Layout
