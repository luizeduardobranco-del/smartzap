/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@zapagent/shared', '@zapagent/database', '@zapagent/ai-engine', '@zapagent/channel-adapters'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@node-rs/argon2', 'tiktoken'],
  },
}

export default nextConfig
