// Jest mock for amqplib - JavaScript version
const connect = jest.fn().mockResolvedValue({
  createChannel: jest.fn().mockResolvedValue({
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    prefetch: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({}),
    ack: jest.fn(),
    nack: jest.fn(),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue({}),
  }),
  close: jest.fn().mockResolvedValue({}),
});

module.exports = { connect };
