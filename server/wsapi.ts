/**
 * Defines an EventEmitter for handling calls from the client.
 * @module wsapi
 */
import { EventEmitter } from 'events';
import * as ws from 'ws';
import * as users from './users';
import config = require('./config');

interface ResponseCallback {
  /**
   * Callback that MUST be called when the request is complete.
   * @param err - If given, returns an error to the client as a rejection response.
   * @param response - Object to return in a "success" response.
   */
  (err: any, response?: any): void;
}

interface NotifyCallback {
  (data: any): void;
}

interface Request {
  user: users.User;
  log: typeof config.logger;
  data: any;
}

interface RequestListener {
  /**
   * Listener for a websocket request.
   * @param request - Request from the client.
   * @param request.user - User object associated with the connection.
   * @param request.log - Logger for this request.
   * @param request.data - Data sent with the request.
   * @param responseCallback - MUST be called when the request is complete.
   * @param notifyCallback - Can be called to send notifications about the request to the client.
   */
  (request: Request, responseCallback: ResponseCallback, notifyCallback: NotifyCallback): void;
}

class ApiEventEmitter extends EventEmitter {
  /**
   * Register a listener for a user request.
   * @param event - Name of the API call to register for.
   * @param listener - Function to call when the client sends a request to this endpoint.
   */
  on(event: string, listener: RequestListener) {
    return super.on(event, listener);
  }
}

// Separate API for trusted scripts
class Service extends ApiEventEmitter {
  private _sockets : Map<string, any>;

  constructor() {
    super();

    // No more than one handler per call
    this.setMaxListeners(1);
    this._sockets = new Map<string, any>();
  }

  registerSocket(socket: ws) : void {
    const uuid = socket.upgradeReq.uuid;

    this._sockets.set(uuid, socket);

    socket.on('close', socket => {
      this._sockets.delete(uuid);
    });

    this.emit('socket-connected', this, socket);
  }

  broadcast(type: string, data: any): void {
    for(let socket of this._sockets.values()) {
      socket.send(JSON.stringify({type: type, data: data}));
    }
  }
}

class Wsapi extends ApiEventEmitter {
  constructor() {
    super();

    // No more than one handler per call
    this.setMaxListeners(1);
  }

  /**
   * API listener for cooperating outside services, such as
   * node-log-forwarder.
   */
  service = new Service();
}

const wsapi: Wsapi = new Wsapi();
export = wsapi;
