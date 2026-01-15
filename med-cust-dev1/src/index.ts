import * as bp from '.botpress'

const bot = new bp.Bot()

bot.message(async ({ client, conversation, event }) => {
  await client.createMessage({
    conversationId: conversation.id,
    type: 'text',
    tags: {},
    payload: {
      text: `Привет! 👋 Получил твоё сообщение: "${event.payload.text}"`,
    },
  })
})

export default bot

