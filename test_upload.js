var http = require('http');
var fs   = require('fs');
var path = require('path');

var ipaPath = path.join(__dirname, 'test_app.ipa');

// Build a simple multipart/form-data body manually
var boundary = '----NodeTestBoundary' + Date.now();
var CRLF = '\r\n';

function buildPart(name, value) {
  return '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="' + name + '"' + CRLF + CRLF +
    value + CRLF;
}

var ipaBuffer = fs.readFileSync(ipaPath);
var preamble = Buffer.from(
  buildPart('save_to_library', 'on') +
  '--' + boundary + CRLF +
  'Content-Disposition: form-data; name="ipa_file"; filename="test_app.ipa"' + CRLF +
  'Content-Type: application/octet-stream' + CRLF + CRLF
);
var epilogue = Buffer.from(CRLF + '--' + boundary + '--' + CRLF);

var body = Buffer.concat([preamble, ipaBuffer, epilogue]);

var options = {
  hostname: 'localhost',
  port: 3000,
  path: '/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length
  }
};

var req = http.request(options, function(res) {
  var data = '';
  res.on('data', function(chunk) { data += chunk; });
  res.on('end', function() {
    console.log('STATUS:', res.statusCode);
    try {
      var json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch(e) {
      console.log(data);
    }
  });
});

req.on('error', function(e) {
  console.error('ERROR:', e.message);
});

req.write(body);
req.end();
