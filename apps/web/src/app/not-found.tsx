import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 28, margin: 0 }}>Page not found</h1>
        <p>This address does not exist in Site Diary.</p>
        <Link href="/">Go to the dashboard</Link>
      </div>
    </div>
  );
}
