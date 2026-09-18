'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#F7F7F5',
          color: '#071E33',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '22rem' }}>
          <p style={{ fontSize: '3rem', margin: 0 }}>🎲</p>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '1rem' }}>
            Er ging iets mis
          </h1>
          <p style={{ color: '#7D93A8', marginTop: '0.5rem', lineHeight: 1.6 }}>
            Snatzee kon niet geladen worden. Probeer het opnieuw.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '3rem',
              width: '100%',
              borderRadius: '9999px',
              border: 'none',
              background: '#24C79A',
              color: '#04131F',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  )
}
