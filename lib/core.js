var nano = require('nano'),
  net = require('net'),
  Nody = require('./nody'),
  through = require('through'),
  stream = require('stream');

var Core = function(port) {
  this.port = port || 80;
  this.payloads = require('nano')('http://localhost:5984').db.use('payloads');
};


Core.prototype.start = function () {
  var self = this;

  var server = net.createServer(function (clientStream) {
    var nodeStream = new stream.PassThrough();

    //client->docker
    clientStream.pipe(through(function(msg) {
      var content = JSON.parse(msg.toString('utf-8'));
      var th = this;

      self.findNodeAddress(content.id, function(address, container) {
        self.loadNode(nodeStream, clientStream, address);
        content.container = container;

        switch(content.command) {
          case 'run':
              content.image = self.getImage(content.language);
              content.cmd = self.getCmd(content.language, content.repository);
              th.queue(JSON.stringify(content));
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
      });
    })).pipe(nodeStream);

    clientStream.on('end', function () {
      nstream.end();
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

      switch(content.command) {
        case 'run':
          var dataf = {
            node: node.address,
            container: content.data.id,
            payload: content.payload,
            info: content.data.info,
            domain: content.payload || content.data.id + self.conf.domain,
          };

          self.payloads.insert(dataf, function(err, body) {
            clientStream.end(JSON.stringify({id: body.id}));
          });
          break;
        case 'info':
          self.payloads.get(content.payload.id, {revs_info: false}, function(err, body) {
            var dataf = {
              id: content.payload.id,
              domain: body.domain,
              created: content.data.Created,
              ports: content.data.NetworkSettings.PortMapping
            };

            clientStream.end(JSON.stringify(dataf));
          });
          break;
        default:
          th.queue(msg);
      }
    } catch(e) {
      th.queue(msg);
    }
  }), {end: false}).pipe(clientStream, {end: false});
};


Core.prototype.findNodeAddress = function(id, cb) {
  if(id) {
    this.payloads.get(id, {revs_info: false}, function(err, body) {
      cb(body.node, body.container);
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
      return 'git clone ' + repo + ' /var/www/html; /sbin/service httpd start; tail -f /var/log/httpd/error_log';
    case 'nodejs':
      return 'git clone ' + repo + ' module; cd module; npm start';
  }
};

module.exports = Core;