var net = require('net');

var Drone = function(address, port) {
  this.port = port || 6001;
  this.address = address;
};


Drone.prototype.connect = function() {
  var self = this;

  return net.connect({port: self.port, host: self.address}, function() {
    console.log('Connected to node ' + self.address);
  });
};

module.exports = Drone;