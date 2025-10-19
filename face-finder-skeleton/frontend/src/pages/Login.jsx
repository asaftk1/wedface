import React, { useState } from 'react'
import { saveToken } from '../lib/auth'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)

    async function onSubmit(e) {
        e.preventDefault()
        setError(null)
        const body = new URLSearchParams()
        body.set('username', email)
        body.set('password', password)
        try {
            const r = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            })
            const j = await r.json()
            if (!r.ok) throw new Error(j.detail || 'login_failed')
            saveToken(j.access_token)
            // שמירת הטוקן (MVP – localStorage. בהמשך אפשר httpOnly cookie)
            localStorage.setItem('ff_token', j.access_token)
            window.location.href = '/'
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <div className="p-6 max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">התחברות</h1>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <input className="input" type="email" placeholder="אימייל" value={email} onChange={e => setEmail(e.target.value)} />
                <input className="input" type="password" placeholder="סיסמה" value={password} onChange={e => setPassword(e.target.value)} />
                {error && <div className="text-red-600 text-sm">{String(error)}</div>}
                <button className="btn" type="submit">התחבר</button>
            </form>
            <div className="text-sm mt-3">
                אין לך חשבון? <a className="underline" href="/register">להרשמה</a>
            </div>
        </div>
    )
}
