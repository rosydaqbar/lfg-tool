import { createElement } from 'react'

const vibeCodedNote = createElement(
  'aside',
  {
    className: 'sidebar-vibe-callout',
    'aria-label': 'Project safety note'
  },
  createElement(
    'p',
    { className: 'sidebar-vibe-callout__title' },
    'Vibe-coded project'
  ),
  createElement(
    'p',
    { className: 'sidebar-vibe-callout__body' },
    'I vibe-coded this project and shipped it fast. This project is provided under CC0. Please review code, validate permissions, and test in a safe server before production use.'
  )
)

export default {
  index: {
    display: 'hidden'
  },
  introduction: 'Introduction',
  setup: 'Setup',
  architecture: 'Architecture',
  api: 'API',
  components: 'Components',
  deployment: 'Deployment',
  troubleshooting: 'Troubleshooting',
  vibeCodedNote: {
    type: 'separator',
    title: vibeCodedNote
  },
  changelog: {
    display: 'hidden'
  },
  'whats-new': {
    display: 'hidden'
  }
}
