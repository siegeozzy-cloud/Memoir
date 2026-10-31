import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

/**
 * Every error the API sends looks like { error: { code, message, field? } }.
 * `message` is written for people (the web app shows it as is); `field` names the form input it's about.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

/** Validates a request body or query; the first problem becomes a 400 pointing at its field. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {})
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const field = typeof issue.path[0] === 'string' ? issue.path[0] : undefined
  const message = issue.code === 'invalid_type' && issue.input === undefined ? `${field ?? 'A value'} is missing.` : issue.message
  throw new HttpError(400, 'invalid', message, field)
}

export function errorHandler(err: FastifyError | HttpError, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) {
    return reply.code(err.status).send({ error: { code: err.code, message: err.message, field: err.field } })
  }
  if (err.statusCode === 429) {
    return reply.code(429).send({ error: { code: 'rate-limited', message: 'Too many attempts. Wait a minute and try again.' } })
  }
  if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ error: { code: 'too-large', message: 'Pick a picture under 8 MB.' } })
  }
  if (err.statusCode && err.statusCode < 500) {
    return reply.code(err.statusCode).send({ error: { code: 'bad-request', message: 'That request wasn’t understood.' } })
  }
  req.log.error(err)
  return reply.code(500).send({ error: { code: 'server', message: 'Something went wrong on our side. Try again.' } })
}
