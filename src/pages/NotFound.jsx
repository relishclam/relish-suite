import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '1rem',
      fontFamily: 'var(--font-body)',
    }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', color: 'var(--navy)' }}>
        404
      </h1>
      <p style={{ color: 'var(--text-muted)' }}>Page not found</p>
      <Link to="/" className="btn btn-primary">Back to Home</Link>
    </div>
  );
}
