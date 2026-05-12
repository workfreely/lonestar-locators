"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleLogin(
    e: React.FormEvent
  ) {
    e.preventDefault()

    setLoading(true)
    setError("")

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push("/admin/leads")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <form
        onSubmit={handleLogin}
        className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Lone Star Locators
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Admin Login
          </p>
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          className="w-full border rounded-xl px-4 py-3"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          className="w-full border rounded-xl px-4 py-3"
        />

        {error && (
          <p className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded-xl py-3 font-medium hover:bg-gray-800 transition"
        >
          {loading
            ? "Signing In..."
            : "Login"}
        </button>
      </form>
    </div>
  )
}