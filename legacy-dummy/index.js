export default {
  async fetch() {
    return new Response('legacy cleanup placeholder', { status: 410 })
  },
}
