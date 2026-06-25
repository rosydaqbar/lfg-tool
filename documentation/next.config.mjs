import nextra from 'nextra'

const docsRoot = process.cwd()

const withNextra = nextra({
  search: {
    codeblocks: false
  }
})

const nextConfig = withNextra({
  outputFileTracingRoot: docsRoot
})

const { experimental, turbopack, ...restConfig } = nextConfig
const { turbo, ...restExperimental } = experimental || {}

export default {
  ...restConfig,
  experimental: restExperimental,
  turbopack: {
    ...turbo,
    ...turbopack,
    rules: {
      ...turbo?.rules,
      ...turbopack?.rules
    }
  }
}
