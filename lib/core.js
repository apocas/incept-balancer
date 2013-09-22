var nano = require('nano'),
  net = require('net'),
  Nody = require('./nody'),
  through = require('through'),
  stream = require('stream');

var Core = function(domain, port) {
  this.port = port || 80;
  this.domain = domain;
  this.payloads = require('nano')('http://localhost:5984').db.use('payloads');
};

//refactoring needed
Core.prototype.start = function () {
  var self = this;

  var server = net.createServer(function (clientStream) {
    var nodeStream = new stream.PassThrough();

    //client->docker
    clientStream.pipe(through(function(msg) {
      var content = JSON.parse(msg.toString('utf-8'));
      var th = this;

      self.findNodeAddress(content.id, function(address, container) {
        if(!address) {
          clientStream.end(JSON.stringify({error: 'container not found'}));
        } else {
          self.loadNode(nodeStream, clientStream, address);
          content.container = container;

          switch(content.command) {
            case 'run':
              content.image = self.getImage(content.language);
              content.cmd = self.getCmd(content.language, content.repository);
              th.queue(JSON.stringify(content));
              break;
            case 'remove':
              self.payloads.get(content.id, {revs_info: false}, function(err, body) {
                self.payloads.destroy(content.id, body._rev, function(err, bodyr) {
                  if(!err) {
                    th.queue(JSON.stringify(content));
                  } else {
                    clientStream.end(JSON.stringify({error: 'failed to remove'}));
                  }
                });
              });
              break;
            case 'list':
              self.payloads.list(function(err, body) {
                var ids = [];
                body.rows.forEach(function(doc) {
                  ids.push(doc.id);
                });
                clientStream.end(JSON.stringify(ids));
              });
              break;
            default:
              th.queue(JSON.stringify(content));
          }
        }
      });
    })).pipe(nodeStream);

    clientStream.on('end', function () {
      nodeStream.end();
    });

  });

  server.listen(this.port, function() {
    console.log('API started!');
  });
};


Core.prototype.loadNode = function(nodeStream, clientStream, address) {
  var self = this;
  
  var node = new Nody(address);
  var aux = node.connect();
  nodeStream.pipe(aux);

  //docker->client
  aux.pipe(through(function(msg) {
    var th = this;

    try {
      var content = JSON.parse(msg.toString('utf-8'));

      if(content.err) {
        clientStream.end(JSON.stringify({error: content.err}));
      } else {
        switch(content.command) {
          case 'run':
            var dataf = {
              node: node.address,
              container: content.data.id,
              payload: content.payload,
              docker: content.data.info,
              domain: content.payload.domain || content.data.id + '.' + self.domain,
            };

            self.payloads.insert(dataf, function(err, body) {
              clientStream.end(JSON.stringify({id: body.id}));
            });
            break;
          case 'start':
            self.payloads.get(content.payload.id, {revs_info: true}, function(err, body) {
              body.docker = content.data;

              self.payloads.insert(body, function(err, body) {
                clientStream.end(JSON.stringify({id: body.id}));
              });
            });
            break;
          case 'info':
            self.payloads.get(content.payload.id, {revs_info: false}, function(err, body) {
              var dataf = {
                id: content.payload.id,
                domain: body.domain,
                created: content.data.Created,
                running: content.data.State.Running
              };

              clientStream.end(JSON.stringify(dataf));
            });
            break;
          default:
            th.queue(msg);
        }
      }
    } catch(e) {
      th.queue(msg);
    }
  }), {end: false}).pipe(clientStream, {end: false});
};


Core.prototype.findNodeAddress = function(id, cb) {
  if(id) {
    this.payloads.get(id, {revs_info: false}, function(err, body) {
      if(!body) {
        cb(undefined, undefined);
      } else {
        cb(body.node, body.container);
      }
    });
  } else {
    cb('127.0.0.1');
  }
};


Core.prototype.getImage = function(language) {
  switch(language) {
    case 'php':
    case 'html':
      return 'apocas/lamp';
    case 'nodejs':
      return 'apocas/node';
  }
};


Core.prototype.getCmd = function(language, repo) {
  switch(language) {
    case 'php':
    case 'html':
    case 'lamp':
      return 'git clone ' + repo + ' /var/www/html; /sbin/service httpd start; tail -f /var/log/httpd/error_log';
    case 'nodejs':
    case 'node':
      return 'git clone ' + repo + ' module; cd module; npm start';
  }
};

module.exports = Core;