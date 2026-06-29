"use client";

import { useState } from "react";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("Неверный токен");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form className="popup" style={{ width: 320 }} onSubmit={submit}>
        <div className="app-logo" style={{ marginBottom: 6 }}>
          sheyn&apos;s <span>plan</span>
          <em>ner</em>
        </div>
        <p style={{ fontSize: 13, color: "var(--mid-gray)", marginBottom: 18 }}>
          Введите токен доступа
        </p>
        <input
          className="form-input"
          type="password"
          value={token}
          autoFocus
          placeholder="Токен"
          onChange={(e) => setToken(e.target.value)}
        />
        {error && (
          <p style={{ color: "var(--terracotta)", fontSize: 12, marginBottom: 12 }}>
            {error}
          </p>
        )}
        <button className="btn-primary" style={{ width: "100%" }} type="submit">
          Войти
        </button>
      </form>
    </div>
  );
}
