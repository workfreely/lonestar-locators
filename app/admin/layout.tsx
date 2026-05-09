import { Inter } from "next/font/google"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`${inter.className} w-screen relative left-1/2 right-1/2 -mx-[50vw] bg-gray-50`}
    >
      {/* Outer spacing (gives breathing room from edges) */}
      <div className="px-6 lg:px-10 py-4">

        {/* Main container */}
        <div className="w-full max-w-[1700px] mx-auto h-[calc(100vh-80px)]">

          {/* Content */}
          <div className="h-full rounded-xl">
            {children}
          </div>

        </div>
      </div>
    </div>
  )
}