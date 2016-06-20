var express = require('express'),
    app = express(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    path = require('path'),
    config = require('../config');


//var basePath = path.join(__dirname, '..');
//app.locals.basedir = basePath;
app.use(express.static('public'));
app.use('/img', express.static('public/img'));
app.use('/css', express.static('public/css'));
app.use('/cards', express.static('public/img/cards'));
app.use('/js', express.static('/public/js'));
//app.set('views', basePath + '/views');


// configure app based on given environment config
app.set('port', config.dev.port);
app.set('client_port', config.client_port);

http.listen(app.get('port'), function(){
  console.log("Server listening on port " + app.get('port'));
});

app.get('/', function(req, res) {
  // res.render('index.jade', {port: app.get('client_port'), env: process.env.NODE_ENV || null});
  res.sendfile(__dirname + '/index.html');
});

module.exports = io;
