import nextra from 'nextra'

const docsRoot = process.cwd()

const withNextra = nextra({
  search: {
    codeblocks: false
  }
})

export default withNextra({
  outputFileTracingRoot: docsRoot
})
