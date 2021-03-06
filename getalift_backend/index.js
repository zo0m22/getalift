/*	=====================================
 *		Backend Server for Get A Lift
 *	-------------------------------------
 *	This is the server-side of the Get A
 *	Lift app.
 *	-------------------------------------
 *	Author	: Argann Bonneau
 *	Date	: 03/07/17
 *	Version	: v0.2.1
 *	=====================================
 */

/*Server IP : 10.249.45.149*/

/* ==============
 *	Requirements
 * ==============
 */
// Express
var express = require("express");
var app = express();

// Mysql driver
var mysql = require("mysql");

// Body parser
var bodyParser = require("body-parser");

// Json web tokens
var jwt = require("jsonwebtoken");

// mathjs
var math = require("mathjs");

//sleep
var sleep = require("sleep");

// Configuration file
var config = require("./config");

// The google maps client, with the API key
var googleMapsClient = require("@google/maps").createClient({
	//key: "AIzaSyDpo3fxBUp4aByqHf4cFTGLx5z6dMD16Jw"
	key: "AIzaSyCrJrav71SD2Bu-oUCm1Sxi563pGwaAsaI"
});

var bcrypt = require("bcrypt");

var kdt = require("kd.tree");

/* ===============
 *	Configuration
 * ===============
 */

// Database connection configuration
var db_con = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "root",
	database: "gal_db",
	insecureAuth:true,
	multipleStatements: true
});


//connection.db_con(function(err) {
//  if (err) throw err
//  console.log('You are now connected...')
//})

// Setting up the app super secret
app.set("superSecret", config.secret);


// Configuration for Body parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


/* ========
 *	Routes
 * ========
 */

var router = express.Router();

// --- Main ---


// Route				: /api/
// URL Params		: None
// Body Params	: None
// Return				: {message: "Hello World !"}
// Description	:
//					This route just send back one very simple json object with "Hello world !".
// 					It can be used to check if the api is online.
router.get("/", function(req, res){
	res.json({message: "Hello World !"});
	console.log("Hello !");
	//addRoute(100);
	testGoogleMaps();
});

// --- User Creation ---

// Route				: POST /api/users
// URL Params		: None
// Body Params	:
// 		- username			: The User's Username
// 		- password			: The User's Password
// 		- name					: His last name
// 		- surname				: His first name
// 		- email					: His email
// 		- mobileNumber	: His mobile number
// Return		:
// 		- success		: boolean that tell if the insertion is a success or not.
// 		- message		: string (if errror) the error message
// 		- errorCode	: int (if error) the error code
// 		- and what the mysql module returns.
// Description	:
//					We must not need a token in order to create an account, because when
//					someone want to create an account,
// 					he is not yet logged in

router.post("/users", function(req, res){
	// First, we check if the username already exists in the database.
	db_con.query("SELECT * FROM User WHERE username = ?", [req.body.username], function(err, result){
		if (err) throw err;
		if (result.length === 1){
			// If the username already exists, we send an error.
			res.json({
				success: 	false,
				message: 	"This Username already exists",
				errorCode:	1
			});
		} else {
			// Else, we hash the password in order to store it in the database.
			var passHash = bcrypt.hashSync(req.body.password, config.saltRounds);
			// And we launch the query that store everything in the db.
			db_con.query(
				"INSERT INTO User (username, password, name, surname, email, mobileNumber) VALUES (?, ?, ?, ?, ?, ?)",
				[req.body.username, passHash, req.body.name, req.body.surname, req.body.email, req.body.mobileNumber],
				function(err, result){
					if(err) throw err;
					// At the end, we respond with a success.
					result.success = true;
					res.json(result);
				}
			);
		}
	});

});

// --- Auth ---

// Route				: POST /api/auth
// URL Params		: None
// Body Params	:
// 		- username			: The User's Username
// 		- password			: The User's Password
// Return		:
// 		- success		: boolean that tell if the auth is a success or not.
// 		- message		: string the resulting message.
// 		- token			: string, if success, the token that is linked to this user.
// 		- user			: object, if success, the instance of the logged user.
// Description	:
//					This route must be used before any other request, in order to
//					get the token that allow the user to use the others API routes.

router.post("/auth", function(req, res){
	// Search for the correct user.
	db_con.query("SELECT * FROM User WHERE username = ?", [req.body.username], function(err, result){
		// If there is an error, throw it.
		if (err) throw err;
		// If there is one user with this username...
		if (result.length === 1){
			// We check if the password given is the good one.
			bcrypt.compare(req.body.password, result[0]["password"], function(err, bres){
				if(bres){
					// It's the good one !
					// We create the token based on this user and our super secret.
					var token = jwt.sign(JSON.stringify(result[0]), app.get("superSecret"));
					// And we send it.
					res.json({ success: true, message: "Auth succeed !", token: token, user: result[0] });
				} else {
					// It's not...
					res.json({ success: false, message: "Auth failed. Wrong credentials." });
				}
			});
		} else {
			// If there is no correct user, we send a failure.
			res.json({ success: false, message: "Auth failed. Wrong username."});
		}
	});
});

// =======================================================================
//	Warning : Every route defined before these lines doesn't need a token
//	to be accessible.
// =======================================================================

// This is an ExpressJS middleware. This code is executed before every route
// defined after. It check if the given token with the request is correct.
router.use(function(req, res, next){
	// We get the token in any of the possible location.
	var token = req.body.token || req.query.token || req.headers["x-access-token"];
	// If there is a token...
	if(token){
		// We check it with jsonwebtoken
		jwt.verify(token, app.get("superSecret"), function(err, decoded){
			if(err){
				// If the token is not valid, we send an error.
				return res.json({ success: false, message: "Failed to auth token." });
			} else {
				// Else, everything is fine, so we call the route that the user wants
				// to access.
				req.decoded = decoded;
				next();
			}
		});
	} else {
		// If there is no token provided, we send an error.
		return res.status(403).send({
			success: false,
			message: "No token provided"
		});
	}
});

// =======================================================================
//	Warning : Every route defined after these lines must need a token to
// 	be accessible. You can define it for example in the header of your
//	HTTP query, with the key "x-access-token".
// =======================================================================

// --- Users ---

// /!\ The creation of a user is before the "auth" method. /!\

// Route				: GET /api/users
// URL Params		: None
// Body Params	: None
// Return		:
// 		- the mysql result object
// Description	:
//					This route send back every public informations about every users.
//					It can be a bit heavy with a lot of users.
router.get("/users", function(req, res){
	db_con.query("SELECT `id`, `username`, `name`, `surname`, `email`, `mobileNumber`, `isVerified` FROM User", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: GET /api/users/:usrid
// URL Params		:
//		- usrid					: The ID of the user you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this user.
// Description	:
//					This route send back the public informations about the chosen user.
router.get("/users/:usrid", function(req, res){
	db_con.query("SELECT `id`, `username`, `name`, `surname`, `email`, `mobileNumber`, `isVerified` FROM User WHERE id = ?", [req.params.usrid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: PUT /api/users/:usrid
// URL Params		:
//		- usrid					: The ID of the user you want to edit the info.
// Body Params	:
// 		- username			: The User's Username
// 		- password			: The User's Password
// 		- name					: His first name
// 		- surname				: His last name
// 		- email					: His email
// 		- mobileNumber	: His mobile number
//		- isVerified		: Is the user is verified ?
// Return		:
// 		- the mysql object for this user.
// Description	:
//					This route update the information about the chosen user.
router.put("/users/:usrid", function(req, res){
	db_con.query("UPDATE User SET username = ?, password = ?, name = ?, surname = ?, email = ?, mobileNumber = ?, isVerified = ? WHERE id = ?",
		[req.body.username, bcrypt.hashSync(req.body.password, config.saltRounds),
			req.body.name, req.body.surname, req.body.email, req.body.mobileNumber,
			req.body.isVerified, req.params.usrid],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: DELETE /api/users/:usrid
// URL Params		:
//		- usrid					: The ID of the user you want to delete.
// Body Params	: None
// Return		:
// 		- the mysql return object.
// Description	:
//					This route deletes the chosen user.
router.delete("/users/:usrid", function(req, res){
	db_con.query("DELETE FROM User WHERE id = ?", [req.params.usrid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// --- Routes ---

// Route				: GET /api/routes
// URL Params		: None
// Body Params	: None
// Return		:
// 		- the mysql result object
// Description	:
//					This route send back every informations about all the routes.
//					It can be a bit heavy with a lot of routes.
router.get("/routes", function(req, res){
	db_con.query("SELECT * FROM Route", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: GET /api/routes/:routeid
// URL Params		:
//		- routeid					: The ID of the route you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this route.
// Description	:
//					This route send back the public informations about the chosen route.
router.get("/routes/:routeid", function(req, res){
	db_con.query("SELECT * FROM Route WHERE id = ?", [req.params.routeid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

router.get("/driverroutes/:driverid", function(req, res){
	db_con.query("SELECT * FROM Route, RouteDate WHERE (Route.id = RouteDate.route) AND (Route.driver = ?)", [req.params.driverid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// RouteDate				: GET /api/routedate/:routeid
// URL Params		:
//		- routeid					: The ID of the route you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this route.
// Description	:
//					This routedate send back the public informations about the chosen routedate.
router.get("/routedate/:routeid", function(req, res){
	db_con.query("SELECT * FROM RouteDate WHERE route = ?", [req.params.routeid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

router.get("/routedate", function(req, res){
	db_con.query("SELECT * FROM RouteDate", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});


// Route				: GET /api/routes/search
// URL Params		:
// 		- startLat			: The Latitude of the starting point
// 		- startLng			: The Longitude of the starting point
// 		- endLat				: The Latitude of the end point
// 		- endLng				: The Longitude of the end point
// 		- startDate			: The starting datetime of the route
// 		- endDate				: The end datetime of the route
//		- maxWaitingSeconds : The max number of seconds that the user can wait.
// Body Params	: None
// Return		:
// 		- An array with every routes that match the parameters.
// Description	:
//		This route can be used in order to search for a route that match specific
//		parameters. Each of these must be provided, none can be null.
router.get("/searchT", function(req, res){
	// We retrieve the parameters in custom vars
	var startDate = req.param("date");
	var startLatitude = parseFloat(req.param("startLat"));
	var startLongitude = parseFloat(req.param("startLng"));
	var endLatitude = parseFloat(req.param("endLat"));
	var endLongitude = parseFloat(req.param("endLng"));
	//var maxWaitingSeconds = req.param("maxWaitingSeconds");

	// then, we simply launch this heavy query into the database.
	db_con.query(
		"SELECT starting_point.`id` as start_p, end_point.`id` as end_p FROM "+
			"(SELECT RP.`route`, RP.`point_rank`, RP.`id` FROM `RoutePoints` RP "+
				"INNER JOIN `Route` R ON R.`id` = RP.`route` "+
				"INNER JOIN `RouteDate`RD ON R.`id` = RD.`route` "+
			"WHERE "+
				"DAYOFWEEK(STR_TO_DATE(?, '%Y-%m-%d %k:%i:%s')) = DAYOFWEEK(`route_date`) "+
			"ORDER BY "+
				"ST_Distance(`point`, ST_GeomFromText('Point(? ?)'))) as starting_point, "+
		"WHERE "+
			"starting_point.`route` = end_point.`route` "+
			"AND "+
			"starting_point.`point_rank` < end_point.`point_rank`; "
		, [startDate, startLatitude, startLongitude, endLatitude, endLongitude],
		function(err, result){
			if(err) throw err;

			res.json(result);
		});
});

// Route				: GET /api/routes/search
// URL Params		:
// 		- startLat			: The Latitude of the starting point
// 		- startLng			: The Longitude of the starting point
// 		- endLat				: The Latitude of the end point
// 		- endLng				: The Longitude of the end point
// 		- startDate			: The starting datetime of the route
// 		- endDate				: The end datetime of the route
//		- maxWaitingSeconds : The max number of seconds that the user can wait.
// Body Params	: None
// Return		:
// 		- An array with every routes that match the parameters.
// Description	:
//		This route can be used in order to search for a route that match specific
//		parameters. Each of these must be provided, none can be null.
router.get("/search/", function(req, res){
	// We retrieve the parameters in custom vars
	var routeDate = req.param("date");
	//var startLatitude = parseFloat(req.param("startLat"));
	//var startLongitude = parseFloat(req.param("startLng"));
	//var endLatitude = parseFloat(req.param("endLat"));
	//var endLongitude = parseFloat(req.param("endLng"));
	//var maxWaitingSeconds = req.param("maxWaitingSeconds");

	// then, we simply launch this heavy query into the database.
	db_con.query("SELECT * FROM Route, RouteDate "+
                 "WHERE (Route.id = RouteDate.route) AND (RouteDate.route_date > ?) "+
                 "ORDER BY RouteDate.route_date"
                 , [routeDate], function(err, result){
			if(err) throw err;
			res.json(result);
		});
});

router.get("/search2/", function(req, res){
	// We retrieve the parameters in custom vars
	var routeDate = req.param("date");
	var startLatitude = parseFloat(req.param("startLat"));
	var startLongitude = parseFloat(req.param("startLng"));
	var endLatitude = parseFloat(req.param("endLat"));
	var endLongitude = parseFloat(req.param("endLng"));
	//var maxWaitingSeconds = req.param("maxWaitingSeconds");

	// then, we simply launch this heavy query into the database.
	db_con.query("SELECT * FROM Route, RouteDate WHERE (Route.id = RouteDate.route) AND ((RouteDate.route_date >= ?) OR ( RouteDate.weekly_repeat= 1 AND DAYOFWEEK(?) = DAYOFWEEK(`route_date`) )) ORDER BY RouteDate.route_date AND ( ST_Distance(Route.startingPoint, ST_GeomFromText('Point(? ?)')) AND ST_Distance(Route.startingPoint, ST_GeomFromText('Point(? ?)')) )"
                 , [routeDate, routeDate, startLatitude, startLongitude, endLatitude, endLongitude], function(err, result){
			if(err) throw err;
			res.json(result);
		});
});



// Route				: PUT /api/routes/
// URL Params		: None
// Body Params	:
// 		- startLat			: The Latitude of the starting point
// 		- startLng			: The Longitude of the starting point
// 		- endLat				: The Latitude of the end point
// 		- endLng				: The Longitude of the end point
// 		- dates					: The array of dates for this route.
// 		- driverId			: The User ID of the driver
//		- origin			: Starting place
//		- destination		: Ending place
// Return		:
// 		- the mysql object for this query.
// Description	:
//		This route create a new Route in the database. It search the optimal
//		directions with the google maps API, in order to store the best route.
router.put("/routes", function(req, res){
	// We store every parameters in custom vars.
	var startLat = parseFloat(req.body.startLat);
	var startLng = parseFloat(req.body.startLng);
	var endLat = parseFloat(req.body.endLat);
	var endLng = parseFloat(req.body.endLng);

    var origin = req.body.origin
    var destination = req.body.destination

	var dates = req.body.dates.split(";");
	//var dates = ["11-04-2018","12-04-2018"];
	//console.log(req.body.dates)
	//console.log(dates);

	var driverId = req.body.driverId;
	var query = "";

	// We get the directions between the two points with the google maps api.
	googleMapsClient.directions({
		origin: ""+startLat+","+startLng,
		destination: ""+endLat+","+endLng
	}, function(error, response){
		// If there is an error with the GM API request, we send it back.
		if(error){
			res.json(error);
		} else {
			var distance = response.json.routes[0].legs[0].distance.value;
			var duration = response.json.routes[0].legs[0].duration.value;

			// If there is no error, we put the new route into the database.
			db_con.query("INSERT INTO `Route` (`id`, `startingPoint`, `endPoint`, `driver`,`originAdress`,`destinationAdress`,`distance`,`duration`) VALUES (NULL, ST_GeomFromText('POINT(? ?)'), ST_GeomFromText('POINT(? ?)'), ?,? ,? ,? , ?);",
				[startLat, startLng, endLat, endLng, driverId, origin, destination, distance, duration],
				function(err, result){
					if(err) throw err;
					// Next, we store the weekly repeat in the database.
					// Each line of the RouteMeta table store a date, and an time interval from this date.
					for (var i = 0; i < dates.length-1; i=i+2){
						query += mysql.format(
							"INSERT INTO `RouteDate` (`id`, `route`, `route_date`, `weekly_repeat`) VALUES (NULL, ?, ?, ?);",
							[result.insertId, dates[i], dates[i+1]]
						);
					}

					// Finally, we store the points in the table RoutePoints, that we got from the Google Maps Directions API
					var steps = response.json.routes[0].legs[0].steps;
					var seconds_from_start = 0;
					var squareId = getSquareId(steps[0].start_location.lat, steps[0].start_location.lng);
					for (var j = 0; j < steps.length; j++){
						if (j === 0){
							// If it's the first step, we need to store the starting point adding to the end point.
							query += mysql.format(
								"INSERT INTO `RoutePoints` (`id`, `route`, `point_rank`, `point`, `seconds_from_start`, `square_id_lat`, `square_id_lng`) VALUES (NULL, ?, ?, ST_GeomFromText('POINT(? ?)'), ?, ?, ?);",
								[result.insertId, 0, steps[0].start_location.lat, steps[0].start_location.lng, seconds_from_start, squareId.lat, squareId.lng]
							);
						}

						squareId = getSquareId(steps[j].start_location.lat, steps[j].start_location.lng);
						seconds_from_start += parseInt(steps[j].duration.value);
						// Then we store the end points for each steps into the database.
						query += mysql.format(
							"INSERT INTO `RoutePoints` (`id`, `route`, `point_rank`, `point`, `seconds_from_start`, `square_id_lat`, `square_id_lng`) VALUES (NULL, ?, ?, ST_GeomFromText('POINT(? ?)'), ?, ?, ?);",
							[result.insertId, j+1, steps[j].end_location.lat, steps[j].end_location.lng, seconds_from_start, squareId.lat, squareId.lng]
						);
					}
					// Then, we launch the query into the database.
					db_con.query(query, [], function(e, r){
						if(e) throw e;
						res.json(r);
					});
				});
		}
	});

});

// Route				: DELETE /api/routes/:routeid
// URL Params		:
//		- routeid					: The ID of the route you want to delete.
// Body Params	: None
// Return		:
// 		- the mysql return object.
// Description	:
//					This route deletes the chosen route.
router.delete("/routes/:routeid", function(req, res){
	db_con.query("DELETE FROM Route WHERE id = ?", [req.params.routeid], function(err, result){
		if(err) throw err;
		res.json(result);
	});

});

// --- Rides ---

// Route				: GET /api/rides
// URL Params		: None
// Body Params	: None
// Return		:
// 		- the mysql result object
// Description	:
//					This route send back every informations about all the rides.
//					It can be a bit heavy with a lot of rides.
router.get("/rides", function(req, res){
	db_con.query("SELECT * FROM Ride", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: GET /api/rides/:rideid
// URL Params		:
//		- usrid					: The ID of the ride you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this ride.
// Description	:
//					This route send back the public informations about the chosen ride.
router.get("/rides/:rideid", function(req, res){
	db_con.query("SELECT * FROM Ride WHERE id = ?", [req.params.rideid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: POST /api/rides/
// URL Params		: None
// Body Params	:
//		- route : the id of the route you want to link to this ride.
// Return		:
// 		- the mysql object for this ride.
// Description	:
//					This route can create a ride in the database.
router.post("/rides", function(req, res){
	db_con.query("INSERT INTO Ride (route) VALUES (?)",
		[req.body.route],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: PUT /api/rides/:rideid
// URL Params		:
//		- rideid					: The ID of the ride you want to edit the info.
// Body Params	:
// 		- route : the id of the route you want to link to this ride.
// Return		:
// 		- the mysql object for this ride.
// Description	:
//					This route update the information about the chosen ride.
router.put("/rides/:rideid", function(req, res){
	db_con.query("UPDATE Ride SET route = ? WHERE id = ?",
		[req.body.route, req.params.rideid],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: DELETE /api/rides/:rideid
// URL Params		:
//		- rideid					: The ID of the ride you want to delete.
// Body Params	: None
// Return		:
// 		- the mysql return object.
// Description	:
//					This route deletes the chosen ride.
router.delete("/rides/:rideid", function(req, res){
	db_con.query("DELETE FROM Ride WHERE id = ?", [req.params.rideid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// --- Passengers ---

// Route				: GET /api/passengers
// URL Params		: None
// Body Params	: None
// Return		:
// 		- the mysql result object
// Description	:
//					This route send back every informations about all the passengers.
//					It can be a bit heavy with a lot of passengers.
router.get("/passengers", function(req, res){
	db_con.query("SELECT * FROM Passenger", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: GET /api/passengers/:passid
// URL Params		:
//		- usrid					: The ID of the passenger you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this passenger.
// Description	:
//					This route send back the public informations about the chosen passenger.
router.get("/passengers/:passid", function(req, res){
	db_con.query("SELECT * FROM Passenger WHERE id = ?", [req.params.passid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: POST /api/passenger/
// URL Params		: None
// Body Params	:
//		- ride 			: the id of the ride you want to link to this passenger.
//		- passenger : the id of the user you want to link to this passenger.
// Return		:
// 		- the mysql object for this passenger.
// Description	:
//					This route can create a passenger in the database.
router.post("/passenger", function(req, res){
	db_con.query("INSERT INTO Passenger (ride, passenger) VALUES (?, ?)",
		[req.body.ride, req.body.passenger],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: PUT /api/passenger/:passid
// URL Params		:
//		- passid					: The ID of the passenger you want to edit the info.
// Body Params	:
//		- ride 			: the id of the ride you want to link to this passenger.
//		- passenger : the id of the user you want to link to this passenger.
// Return		:
// 		- the mysql object for this ride.
// Description	:
//					This route update the information about the chosen ride.
router.put("/passenger/:passid", function(req, res){
	db_con.query("UPDATE Passenger SET ride = ?, passenger = ? WHERE id = ?",
		[req.body.ride, req.body.passenger, req.params.passid],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: DELETE /api/passenger/:passid
// URL Params		:
//		- passid					: The ID of the passenger you want to delete.
// Body Params	: None
// Return		:
// 		- the mysql return object.
// Description	:
//					This route deletes the chosen passenger.
router.delete("/passenger/:passid", function(req, res){
	db_con.query("DELETE FROM Passenger WHERE id = ?", [req.params.passid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// --- Ratings ---

// Route				: GET /api/ratings
// URL Params		: None
// Body Params	: None
// Return		:
// 		- the mysql result object
// Description	:
//					This route send back every informations about all the ratings.
//					It can be a bit heavy with a lot of rates.
router.get("/ratings", function(req, res){
	db_con.query("SELECT * FROM Rating", function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: GET /api/ratings/:rateid
// URL Params		:
//		- usrid					: The ID of the rate you want to retrieve the info.
// Body Params	: None
// Return		:
// 		- the mysql object for this rate.
// Description	:
//					This route send back the public informations about the chosen rate.
router.get("/ratings/:rateid", function(req, res){
	db_con.query("SELECT * FROM Rating WHERE id = ?", [req.params.rateid], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});

// Route				: POST /api/ratings/
// URL Params		: None
// Body Params	:
//		- author : the id of the user that creates this rating.
//		- target : the id of the user that is the target of this rating.
//		- ride	 : the id of the ride that is linked to this rating.
//		- stars	 : the number of stars that are linked to this rating.
//		- comment: the text linked to this rating.
//		- postDate: the datetime of this rating.
// Return		:
// 		- the mysql object for this ride.
// Description	:
//					This route can create a ride in the database.
router.post("/ratings", function(req, res){
	db_con.query("INSERT INTO Rating (author, target, ride, stars, comment, postDate) VALUES (?, ?, ?, ?, ?, ?)",
		[req.body.author, req.body.target, req.body.ride, req.body.stars, req.body.comment, req.body.postDate],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: PUT /api/ratings/:rateid
// URL Params		:
//		- rateid					: The ID of the rate you want to edit the info.
// Body Params	:
//		- author : the id of the user that creates this rating.
//		- target : the id of the user that is the target of this rating.
//		- ride	 : the id of the ride that is linked to this rating.
//		- stars	 : the number of stars that are linked to this rating.
//		- comment: the text linked to this rating.
//		- postDate: the datetime of this rating.
// Return		:
// 		- the mysql object for this rate.
// Description	:
//					This route update the information about the chosen rating.
router.put("/ratings/:rateid", function(req, res){
	db_con.query("UPDATE Rating SET author = ?, target = ?, ride = ?, stars = ?, comment = ?, postDate = ? WHERE id = ?",
		[req.body.author, req.body.target, req.body.ride, req.body.stars, req.body.comment, req.body.postDate, req.params.rateid],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

// Route				: DELETE /api/ratings/:rateid
// URL Params		:
//		- rateid					: The ID of the rating you want to delete.
// Body Params	: None
// Return		:
// 		- the mysql return object.
// Description	:
//					This route deletes the chosen rate.
router.delete("/ratings/:rateid", function(req, res){
	db_con.query("DELETE FROM Rating WHERE id = ?", [req.params.rateid], function(err, result){
		if(err) throw err;
		res.json(result);
	});

});










router.get("/favoriteRoute/:userId", function(req, res){
	db_con.query("SELECT * FROM FavoriteRoute, Route WHERE ((FavoriteRoute.userId = ?) AND (FavoriteRoute.routeId = Route.id))", [req.params.userId], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});


router.get("/favoriteRoute", function(req, res){
    var userId = req.param("userId")
    var routeId = req.param("routeId")
	db_con.query("SELECT * FROM FavoriteRoute WHERE FavoriteRoute.userId = ? AND FavoriteRoute.routeId = ?", [userId, routeId], function(err, result){
		if(err) throw err;
		res.json(result);
	});
});


router.post("/favoriteRoute", function(req, res){
	db_con.query("INSERT INTO FavoriteRoute (routeId, userId) VALUES (?,?)",
		[req.body.routeId, req.body.userId],
		function(err, result){
			if(err) throw err;
			res.json(result);
		}
	);
});

router.delete("/favoriteRoute/:routeId", function(req, res){
	db_con.query("DELETE FROM FavoriteRoute WHERE routeId = ?", [req.params.routeId], function(err, result){
		if(err) throw err;
		res.json(result);
	});

});


/* Ne fonctionne pas
router.delete("/favoriteRouteDoublons", function(req, res){
	db_con.query("DELETE FROM FavoriteRoute LEFT OUTER JOIN (SELECT MIN(FavoriteRoute.id) as (routeId, userId) FROM FavoriteRoute GROUP BY (FavoriteRoute.routeId, FavoriteRoute.userId)) as t1 ON FavoriteRoute.id = t1.id WHERE t1.id IS NULL", function(err, result){
		if(err) throw err;
		res.json(result);
	});

});

*/


// Route				: GET /api/routes/findTarget
// URL Params		:
// 		- startLat			: The Latitude of the starting point
// 		- startLng			: The Longitude of the starting point
// 		- endLat				: The Latitude of the end point
// 		- endLng				: The Longitude of the end point
// 		- startDate			: The starting datetime of the route
// Body Params	: None
// Return		:
// 		- An array with every routes that match the parameters.
// Description	:
//		This route can be used in order to search for a route that match specific
//		parameters. Each of these must be provided, none can be null.
router.post("/findTarget", function(req, res){
	var d = new Date();
	var t1 = d.getTime();

	var passenger = {
		startPoint: {lat: parseFloat(req.body.startLat),lng: parseFloat(req.body.startLng)},
		endPoint: {lat: parseFloat(req.body.endLat),lng: parseFloat(req.body.endLng)},
		startDate: req.body.startDate}

	//Passenger starting point square ID
	var pSPSI = getSquareId(passenger.startPoint.lat,passenger.startPoint.lng);
	//Passenger ending point square ID
	var pEPSI = getSquareId(passenger.endPoint.lat,passenger.endPoint.lng);

    var query = "Select distinct route from `RoutePoints` RP "+
			"WHERE "+
				"RP.square_id_lng = "+ pSPSI.lng +
				" AND "+
				"RP.square_id_lat = "+ pSPSI.lat+
					" AND "+
						"RP.route IN "+
							"("+
								"Select distinct route from `RoutePoints` RP "+
									"WHERE "+
										"RP.square_id_lng = "+ pEPSI.lng +
											" AND "+
										"RP.square_id_lat = "+ pEPSI.lat +
							" )";

	console.log("### FIRST STEP (SQUAREID) ###");
	console.log(query);

	db_con.query(
		query
		,
		function(err, result){
			if(err) throw err;

			console.log(result);

			var conditions="(";
			result.forEach(function(element,index,array) {
			  if(index==0){
				  conditions+=element.route;
			  }else{
				  conditions+=","+element.route;
			  }
			})
			conditions+=")";

			var query = "SELECT * FROM `Route` R "+
				"INNER JOIN "+
					"`RouteDate` RD on R.id = RD.route "+
				"WHERE "+
					"RD.route_date > "+"'"+passenger.startDate+"'"+
				" AND "+
					"R.id IN " +conditions+";";

			console.log("### SECOND STEP (DATE) ###");
			console.log(query);

			//First target selection
			db_con.query(
				query
				,
				function(err, result){
					if(err) throw err;
					/*FIRST REFINE SELECTION : DOES DRIVERS DIRECTION MATCHES WITH PASSENGER ? */
					var second_refined_selection = refineWithAngle(passenger,result);
					console.log("NB ELEMENTS with angle OK : "+second_refined_selection.length);
					/*SECOND REFINE SELECTION : Find route that got route points that are close to the departure and arrival point of the passenger  */
					var conditions="(";
					second_refined_selection.forEach(function(element,index,array) {
					  if(index==0){
						  conditions+=element;
					  }else{
						  conditions+=","+element;
					  }
					})
					conditions+=")";

					var query = "SELECT id,point,route,seconds_from_start FROM `RoutePoints` RP "+
						"WHERE "+
							"RP.route IN "+conditions;

					db_con.query(
						query,
						function(err,result){
							if(err) throw err;
							var rep = refineWithRoutePoints(passenger, result);
							var d = new Date();
							var t2 = d.getTime();
							console.log("TEMPS TOTAL : ");
							console.log((t2-t1)/1000 +" secondes");
							res.json(rep);
						}
					)
				});

	});

	/*var startPointDriver = {lat: parseFloat(req.body.startLatDriver),lng: parseFloat(req.body.startLngDriver)};
	var endPointDriver = {lat: parseFloat(req.body.endLatDriver),lng: parseFloat(req.body.endLngDriver)};
	calculateGlobalPath(startPointPassenger,endPointPassenger,startPointDriver,endPointDriver, function(response){
		res.json(response);
	});*/
});

/* ==================
 *	Google Maps API Functions
 * ==================
 */


/*
Calculate the global path of a passenger using GoogleMapsAPI
This global path includes 3 sub-paths :
- The walking path between the starting point of the passenger to the point where the passenger and the driver will meet.
- The driving path between the point where they meet to the point where they separate
- The walking path between the point where they separate to the ending point of the passenger
*/
function calculateGlobalPath(startPointPassenger,endPointPassenger,startPointDriver,endPointDriver,callback){
	tab = [];
	calculatePath(startPointPassenger,startPointDriver,"walking", function(response){
		tab.push(response);
		calculatePath(startPointDriver,endPointDriver,"driving", function(response){
			tab.push(response);
			calculatePath(endPointDriver,endPointPassenger,"walking", function(response){
				tab.push(response);
				callback(tab);
			});
		});
	});
}

/*
Calculate a path beetween two points using GoogleMapsAPI
*/
function calculatePath(startPoint,endPoint,travelingMode,callback){
		googleMapsClient.directions({
			origin: {lat: startPoint.lat, lng: startPoint.lng},
		   	destination: {lat: endPoint.lat, lng: endPoint.lng},
		   	mode: travelingMode
		}, function(error, response){
			if(error){
				res.json(error);
				return null;
			}else{
				callback(response);
			}
		});
}


/* ==================
 *	Functions used to find drivers routes that could match with the passenger route
 * ==================
 */

 // URL Params		:
 // 		- passenger				: passenger object {startPoint : {lat,lng}, endPoint : {lat,lng}}
 // 		- result				: an array of routes that matches the previous step of the findTarget query
 // Body Params	: None
 // Return		:
 // 		- An array with the 3 best routes
 // Description	:
 //		This function is used to find the best target depending on the passenger parameters.
 //		It use a kd-tree algorithm to find the closest neighbor in a 2D plan composed of every routesPoint of one route.
 // 	It also calculate the distance in meters between the passenger starting point to the driver closest routePoint
 //		Same for the passenger ending point.

function refineWithRoutePoints(passenger,result){
	var tab = [];
	var index;

	for(var j=0;j<result.length;j++){
		index = keyExists(tab,result[j].route);
		if(index != null){
			tab[index].routePoints.push(result[j]);
		}else{
			var tmp = {id : result[j].route, routePoints : []};
			tmp.routePoints.push(result[j]);
			tab.push(tmp);
		}
	}

	var distance = function(a, b){
	  return Math.pow(a.lat - b.lat, 2) +  Math.pow(a.lng - b.lng, 2);
	}

	//For every routes
	for(var i=0;i<tab.length;i++){
		var points = [];
		//We had all the routePoints of the route to the kd-tree.
		for(var j=0; j<tab[i].routePoints.length;j++){
			points.push({id: tab[i].routePoints[j].id, lat:tab[i].routePoints[j].point.x, lng: tab[i].routePoints[j].point.y})
		}

		var tree = new kdt.createKdTree(points, distance, ["lat","lng"]);

		//Find the closest neighbor from the starting point
		tab[i].closestPointStart = tree.nearest(passenger.startPoint,1);
		//Find the closest neighbor from the ending point
		tab[i].closestPointEnd = tree.nearest(passenger.endPoint,1);

		//Calculate distance in meters
		tab[i].distancePointStart = coordToMeters(passenger.startPoint.lat, passenger.startPoint.lng, tab[i].closestPointStart[0][0].lat, tab[i].closestPointStart[0][0].lng);
		tab[i].distancePointEnd = coordToMeters(passenger.endPoint.lat, passenger.endPoint.lng, tab[i].closestPointEnd[0][0].lat, tab[i].closestPointEnd[0][0].lng);
		tab[i].totalDistance = tab[i].distancePointStart + tab[i].distancePointEnd;
	}


	tab.sort(compareDistance);

	for(var i=0;i<tab.length;i++){
		console.log("############");
		console.log("Route " + tab[i].id);
		console.log("Closest Point Start");
		console.log(tab[i].closestPointStart);
		console.log("Distance Point Start");
		console.log(tab[i].distancePointStart + " meters");
		console.log("Closest Point End");
		console.log(tab[i].closestPointEnd);
		console.log("Distance Point End");
		console.log(tab[i].distancePointEnd + " meters");
	}
}

 // URL Params		:
 // 		- passenger					: passenger object {startPoint : {lat,lng}, endPoint : {lat,lng}}
 // 		- drivers_vector	: array of vector of all the routes of the database. The vector goes from the startingPoint to the endingPoint of the route.
 // Return		:
 // 		- An array of routes ID
 // Description	:
 //		Return the id of routes that matches with the passenger routes direction
 //		If the angle between the passenger vector and the driver vector is less than 90°, then it returns the route.
 //    	This function is used to detect every route that goes in the wrong direction in order to reduce the numbers
 // 	of routes analysed in the second step of the search.
function refineWithAngle(passenger,drivers_vector){
	var passenger_vector = {
		y: passenger.endPoint.lng-passenger.startPoint.lng,
		x: passenger.endPoint.lat-passenger.startPoint.lat
	};

	var first_refined_selection = [];

	for(var i=0;i<drivers_vector.length;i++){
		var driver_vector = {
			y: drivers_vector[i].endPoint.y - drivers_vector[i].startingPoint.y,
			x: drivers_vector[i].endPoint.x - drivers_vector[i].startingPoint.x
		};
		/*If the angle between the passenger direction and the driver direction
		is lower than 90 degrees, we keep the target, else we don't keep it.*/
		if(getAngle(passenger_vector,driver_vector)<90){
			first_refined_selection.push(drivers_vector[i].route);
		};

		console.log("ROUTE N "+drivers_vector[i].route);
		console.log("ANGLE : "+getAngle(passenger_vector,driver_vector));
	}

	return first_refined_selection;
}

/*This function calculate the angle between two vectors*/
function getAngle(passenger_vector, driver_vector){
	//Calcul vectors norm
	passenger_vector.norm = math.norm([passenger_vector.x, passenger_vector.y]);
	driver_vector.norm = math.norm([driver_vector.x, driver_vector.y]);
	// Scalar product calcul, scalar_product = (v1.x * v2.x) + (v1.y * v2.y)
	var scalar_product = (passenger_vector.x * driver_vector.x) + (passenger_vector.y * driver_vector.y);
	// Cosinus calcul, cos =  scalar_product / (v1.norm * v2.norm)
	var cos = scalar_product/(passenger_vector.norm * driver_vector.norm);
	//Converting from radians to degrees
	var angle = (math.acos(cos) * 180) / math.PI;
	return angle;
}

/*Calcul the distane between two geographical points*/
function getDistance(xa,ya,xb,yb){
	return math.sqrt(math.square(xb-xa)+math.square(yb-ya));
}

/* Calcul the distance in meters between two geographical points*/
function coordToMeters(lat1, lon1, lat2, lon2){  // generally used geo measurement function
    var R = 6378.137; // Radius of earth in KM
    var dLat = lat2 * Math.PI / 180 - lat1 * Math.PI / 180;
    var dLon = lon2 * Math.PI / 180 - lon1 * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c;
    return d * 1000; // meters
}

/*This function is used to sort a array of distances.*/
function compareDistance(pointA,pointB){
	if(pointA.totalDistance>pointB.totalDistance){
		return 1;
	}else{
		return -1;
	}
}

/*This function checks if the key exists in the array.*/
function keyExists(tab,key){
	for(var i=0; i<tab.length; i++){
		if(tab[i].id == key){
			return i;
		}
	}

	return null;
}

/*This function calculate the squareId of a geographical point.*/
function getSquareId(latitude,longitude){
	//latitude : from -90 to 90
	//lat : from 0 to 180
	var lat = 90 + latitude;
	//longitude : from -180 to 180
	//lng : from 0 to 360
	var lng = 180 + longitude;

	var arr = {lat: math.floor(lat/0.005), lng: math.floor(lng/0.005)};
	return arr;
}


//		- startLat			: The Latitude of the starting point
// 		- startLng			: The Longitude of the starting point
// 		- endLat				: The Latitude of the end point
// 		- endLng				: The Longitude of the end point
// 		- dates					: The array of dates for this route.
// 		- driverId			: The User ID of the driver
//		- origin			: Starting place
//		- destination		: Ending place
function addRoute(nb){
	if(nb > 0){
		console.log("Creation "+nb);
		var minLng = 14.349733799999967;
		var maxLng = 14.57017099999996;
		var minLat = 35.8335387;
		var maxLat = 35.987778;

		var req = {url : null, method : null, body: {}};
		var startLng = math.random() * (maxLng-minLng) + minLng;
		var startLat = math.random() * (maxLat-minLat) + minLat;
		var endLng = math.random() * (maxLng-minLng) + minLng;
		var endLat = math.random() * (maxLat-minLat) + minLat;
		var driverId = 2;
		//ar dates = req.body.dates.split(";");
		//var dates = ["11-04-2018","12-04-2018"];
		var dates = ["2018-06-08 18:00:00","0"];
		var origin = "";
		var destination = "";

		var query = "";

		// We get the directions between the two points with the google maps api.
		googleMapsClient.directions({
			origin: ""+startLat+","+startLng,
			destination: ""+endLat+","+endLng
		}, function(error, response){
			// If there is an error with the GM API request, we send it back.
			if(error){
				res.json(error);
			} else {
				for (var cpt=0;cpt<100;cpt++){
					var distance = response.json.routes[0].legs[0].distance.value;
					var duration = response.json.routes[0].legs[0].duration.value;

					// If there is no error, we put the new route into the database.
					db_con.query("INSERT INTO `Route` (`id`, `startingPoint`, `endPoint`, `driver`,`originAdress`,`destinationAdress`,`distance`,`duration`) VALUES (NULL, ST_GeomFromText('POINT(? ?)'), ST_GeomFromText('POINT(? ?)'), ?,? ,? ,? , ?);",
						[startLat, startLng, endLat, endLng, driverId, origin, destination, distance, duration],
						function(err, result){
							if(err) throw err;
							// Next, we store the weekly repeat in the database.
							// Each line of the RouteMeta table store a date, and an time interval from this date.
							for (var i = 0; i < dates.length-1; i=i+2){
								query += mysql.format(
									"INSERT INTO `RouteDate` (`id`, `route`, `route_date`, `weekly_repeat`) VALUES (NULL, ?, ?, ?);",
									[result.insertId, dates[i], dates[i+1]]
								);
							}

							// Finally, we store the points in the table RoutePoints, that we got from the Google Maps Directions API
							var steps = response.json.routes[0].legs[0].steps;
							var seconds_from_start = 0;
							var squareId = getSquareId(steps[0].start_location.lat, steps[0].start_location.lng);
							for (var j = 0; j < steps.length; j++){
								if (j === 0){
									// If it's the first step, we need to store the starting point adding to the end point.
									query += mysql.format(
										"INSERT INTO `RoutePoints` (`id`, `route`, `point_rank`, `point`, `seconds_from_start`, `square_id_lat`, `square_id_lng`) VALUES (NULL, ?, ?, ST_GeomFromText('POINT(? ?)'), ?, ?, ?);",
										[result.insertId, 0, steps[0].start_location.lat, steps[0].start_location.lng, seconds_from_start, squareId.lat, squareId.lng]
									);
								}

								squareId = getSquareId(steps[j].start_location.lat, steps[j].start_location.lng);
								seconds_from_start += parseInt(steps[j].duration.value);
								// Then we store the end points for each steps into the database.
								query += mysql.format(
									"INSERT INTO `RoutePoints` (`id`, `route`, `point_rank`, `point`, `seconds_from_start`, `square_id_lat`, `square_id_lng`) VALUES (NULL, ?, ?, ST_GeomFromText('POINT(? ?)'), ?, ?, ?);",
									[result.insertId, j+1, steps[j].end_location.lat, steps[j].end_location.lng, seconds_from_start, squareId.lat, squareId.lng]
								);
							}
							// Then, we launch the query into the database.
							db_con.query(query, [], function(e, r){
								if(e) throw e;
							});
						});
				}
			}
		});
		//console.log("Sleeping....")
		//sleep.sleep(2);
		addRoute(nb-1);
	}
}

function testGoogleMaps(){
	console.log("test gmap...");
	googleMapsClient.directions({
		origin: "35.9015315,14.485157599999999";
		destination: "35.85411349999999,14.48327949999998";
	}, function(error, response){
		// If there is an error with the GM API request, we send it back.
		if(error){
			console.log("error");
			res.json(error);
		} else {
			console.log("SUCCESS");
			console.log(response);
		}
	});
}

/* ==================
 *	Server listening
 * ==================
 */
app.use("/api", router);

app.listen(7878, function () {
	console.log("[S] Server is listening on port 7878.");
});
