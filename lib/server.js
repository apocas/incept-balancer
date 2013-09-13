var nano = require('nano'),
  net = require('net'),
  Nody = require('./nody'),
  through = require('through'),
  stream = require('stream');

var Server = function(port) {
  this.nodes = [];
  this.clients = [];

  this.port = port || 6000;

  var nano = require('nano')('http://localhost:5984');
  this.payloads = nano.db.use('payloads');
};


Server.prototype.start = function () {
  var self = this;

  var server = net.createServer(function (cstream) {
    var nstream = new stream.PassThrough();

    cstream.pipe(through(function(msg) {
      var raw_content = msg.toString('utf-8');
      var content = JSON.parse(raw_content);
      var th = this;

      self.findBestNode(content.id, function(address, container) {
        self.loadNode(nstream, cstream, address);
        content.container = container;

        if(content.command !== 'list') {
          th.queue(JSON.stringify(content));
        } else {
          self.payloads.list(function(err, body) {
            var ids = [];
            body.rows.forEach(function(doc) {
              ids.push(doc.id);
            });
            cstream.end(JSON.stringify(ids));
          });
        }
      });
    })).pipe(nstream);

    cstream.on('end', function () {
      nstream.end();
    });

  });

  server.listen(80, function() {
    console.log('API started!');
  });
};


Server.prototype.loadNode = function(stream, cstream, address) {
  var self = this;
  
  var node = new Nody(address);
  var aux = node.connect();
  stream.pipe(aux);

  aux.pipe(through(function(msg) {
    var th = this;

    try {
      var raw_content = msg.toString('utf-8');
      var content = JSON.parse(raw_content);

      if(content.command !== 'running') {
        this.queue(msg);
      } else {
        var dataf = {};
        dataf.node = node.address;
        dataf.container = content.data.id;
        dataf.payload = content.payload;

        self.payloads.insert(dataf, function(err, body) {
          th.queue(JSON.stringify({id: body.id}));
        });
      }
    } catch(e) {
      this.queue(msg);
    }
  })).pipe(cstream);
};


Server.prototype.findBestNode = function(id, cb) {
  if(id) {
    this.payloads.get(id, { revs_info: false }, function(err, body) {
      cb(body.node, body.container);
    });
  } else {
    cb('127.0.0.1');
  }
};

module.exports = Server;