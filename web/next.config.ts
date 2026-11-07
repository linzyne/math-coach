import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /api/py/* 는 Python(FastAPI) 검증 서버로 보낸다.
  // 개발: 로컬 uvicorn(8000) / 배포: Vercel Python 함수(api/index.py)
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination: process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/",
      },
    ];
  },
};

export default nextConfig;
