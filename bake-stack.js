//###########################################
// Cloudformation Bakery
//###########################################

var fs = require('fs');
var _ = require('lodash');
var yargs = require('yargs');


var bucket = "rtcapp/";


//###########################################
// Util Methods
//###########################################

var find = function(key, array) { // find value in AWS parameter json file
	var index = -1;
	var value = null;
	array.forEach(function(item, i) {
		if (item.ParameterKey === key) {
			value = item.ParameterValue;
			index = i;
		}
	});

	if (value) return [index, value];
};


var puts = function(error, stdout, stderr) {
	if (stdout) {
		console.log(stdout);
	}
	if (stderr) {
		console.log(stderr);
	}
};

//###########################################
// Application Setup
//###########################################

if (yargs.length < 2) return console.log("you must specify an application and an environment");

var app = yargs.argv._[0];
var env = yargs.argv._[1];

var supportedEnvs = {
	'dev': 1,
	'uat': 1,
	'prod': 1
};

if (!supportedEnvs[env]) return console.log("Please provide a valid env");

var util = require('util');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
exec("rm -fr ./build/*",puts);

console.log("Downloading current state of params");
execSync("rm -fr "+__dirname+"build", puts);
execSync("mkdir "+__dirname+"build", puts);
execSync("aws s3 cp s3://"+bucket + app + "-params.json " + __dirname+"/build/", puts);

//###########################################
// Merging resources into final configuration
//###########################################

var basePath = "./cfn-scripts/";

var files = fs.readdirSync(basePath);
var base = require('./base.json');
var resources = files.map(function(file) {
	return JSON.parse(fs.readFileSync(basePath + file));
});

var output = {};

output = _.merge(output, base);

resources.forEach(function(res) {
	output = _.merge(output, res);
});

fs.writeFileSync('./build/' + app + '-merged.json', JSON.stringify(output, null, '\t'));


//###########################################
// Modifying paramters and updating state
//###########################################

var data = require('./build/' + app + '-params.json'); //Load Parameters to modify

var buildNumber = find('BuildNumber', data);
buildNumber[1] = (parseInt(buildNumber[1]) + 1) + "";
data[buildNumber[0]].ParameterValue = buildNumber[1];

data[find('NetworkSecurityEnv', data)[0]].ParameterValue = env;

var application = find('Application', data)[1];
var product = find('Product', data)[1];

fs.writeFileSync('./build/' + app + '-params.json', JSON.stringify(data, null, '\t'));


var s3Base = "s3://"+bucket;
var stackName = [env, buildNumber[1], product].join('-');
var s3StackBase = s3Base+"deployments/" + stackName + "/";

//###########################################
// Baking the stack
//###########################################

exec("aws s3 cp --recursive " + __dirname + "/resources/ "+ s3StackBase, puts);
exec("aws s3 cp " + __dirname + "/build/" + app + "-merged.json " + s3StackBase, puts);
exec("aws s3 cp " + __dirname + "/build/" + app + "-params.json " + s3StackBase, puts);

exec("aws s3 cp " + __dirname + "/build/" + app + "-params.json " + s3Base, puts);

exec("aws cloudformation create-stack --stack-name " + stackName + " --template-body file://" + __dirname + "/build/"+ app +"-merged.json --parameters file:///" + __dirname + "/build/" + app + "-params.json --capabilities CAPABILITY_IAM", puts);