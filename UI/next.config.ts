import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  reactStrictMode: true,
};

const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug", ["rehype-pretty-code", { theme: "vesper", keepBackground: false, defaultLang: "tsx" }]],
  },
});

export default withMDX(nextConfig);
