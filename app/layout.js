export const metadata = {
  title: 'OrbitFS',
  description: 'OrbitFS web conversion for Vercel'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
