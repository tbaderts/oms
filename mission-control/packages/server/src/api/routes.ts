import { Hono } from 'hono'
import { investigationsRouter } from './investigations.js'
import { playbooksRouter } from './playbooks.js'
import { adaptersRouter } from './adapters.js'
import { configRouter } from './config.js'

export const apiRouter = new Hono()

apiRouter.route('/investigations', investigationsRouter)
apiRouter.route('/playbooks', playbooksRouter)
apiRouter.route('/adapters', adaptersRouter)
apiRouter.route('/config', configRouter)
