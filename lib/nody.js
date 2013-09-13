var net = require('net');


var Nody = function(address, port) {
  this.port = port || 6001;
  this.address = address;
};


Nody.prototype.connect = function() {
  var self = this;

  return net.connect({port: self.port, host: self.address}, function() {
    console.log('Connected to node ' + self.address);
  });
};

module.exports = Nody;