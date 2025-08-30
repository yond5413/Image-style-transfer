import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-white text-2xl font-bold">
          Style Transfer
        </Link>
        <div className="space-x-4">
          <Link href="/image" className="text-gray-300 hover:text-white">
            Image
          </Link>
          <Link href="/video" className="text-gray-300 hover:text-white">
            Video
          </Link>
        </div>
      </div>
    </nav>
  );
}
