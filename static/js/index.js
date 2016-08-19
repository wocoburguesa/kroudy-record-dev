/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('wss://' + location.host + '/one2one');
var videoInput;
var videoOutput;
var videoName;
var videoNameSave;
var videoNameDiscard;
var videoNameInput;
var videoLink;
var webRtcPeer;
var lastCalledPeer;

var registerName = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
var registerState = null

function setRegisterState(nextState) {
	switch (nextState) {
	case NOT_REGISTERED:
		$('#register').attr('disabled', false);
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', true);
		break;

	case REGISTERING:
		$('#register').attr('disabled', true);
		break;

	case REGISTERED:
		$('#register').attr('disabled', true);
		setCallState(NO_CALL);
		break;

	default:
		return;
	}
	registerState = nextState;
}

const NO_CALL = 0;
const PROCESSING_CALL = 1;
const IN_CALL = 2;
var callState = null

function setCallState(nextState) {
	switch (nextState) {
	case NO_CALL:
		$('#call').attr('disabled', false);
		$('#terminate').attr('disabled', true);
		break;

	case PROCESSING_CALL:
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', true);
		break;
	case IN_CALL:
		$('#call').attr('disabled', true);
		$('#terminate').attr('disabled', false);
		break;
	default:
		return;
	}
	callState = nextState;
}

window.onload = function() {
//	console = new Console();
	setRegisterState(NOT_REGISTERED);
	var drag = new Draggabilly(document.getElementById('videoSmall'));
	videoInput = document.getElementById('videoInput');
	videoOutput = document.getElementById('videoOutput');
    videoName = $('#video-name');
    videoLink = $('#video-link');
    videoNameSave = $('#video-name > .btn-success');
    videoNameDiscard = $('#video-name > .btn-danger');
    videoNameInput = $('#video-name > input');
    $(videoInput).hide();
    $(videoOutput).hide();
    videoName.hide()
    videoLink.hide()
    videoNameSave.click(function () {
	sendMessage({
	    id: 'saveVideo',
	    name: videoNameInput.val(),
	    user: $('#name').val(),
	    peer: lastCalledPeer
	})
    });

    videoNameDiscard.click(function () {
	videoName.hide();
	videoLink.hide();
    });

	document.getElementById('name').focus();

	document.getElementById('register').addEventListener('click', function() {
		register();
	});
	document.getElementById('call').addEventListener('click', function() {
		call();
	});
	document.getElementById('terminate').addEventListener('click', function() {
		stop();
	});
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'registerResponse':
		resgisterResponse(parsedMessage);
	    showVideoArchive(parsedMessage.videos);
		break;
	case 'callResponse':
		callResponse(parsedMessage);
		break;
	case 'incomingCall':
		incomingCall(parsedMessage);
		break;
	case 'startCommunication':
		startCommunication(parsedMessage);
		break;
	case 'stopCommunication':
		console.info("Communication ended by remote peer");
		stop(true);
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate)
		break;
	case 'newUser':
	    console.log('new user');
	        refreshUserList(parsedMessage);
	        break;
	case 'videoReady':
	    console.log('video ready');
	    notifyVideoReady(parsedMessage);
	    break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

function showVideoArchive(videos) {
    var videoContainer = $('#video-list');
    var newVideoLink;
    for (var i = 0; i < videos.length; i++) {
	newVideoLink = $(
	    '<a type="button" class="list-group-item">' +
		videos[i] + '</a>'
	);
	newVideoLink.attr('href', '/video/' + videos[i]);
	newVideoLink.attr('target', '_blank');
	videoContainer.append(newVideoLink);
    }
}

function showVideoNameInput(message){
    videoNameInput[0].placeholder =  message.name;
    videoName.show();
}

function notifyVideoReady(message) {
    var videoLinkA = $('#video-link a');
    videoLink.show();
    videoLinkA.attr('href', '/video/' + message.name);
    videoName.hide();
}

function refreshUserList(message) {
    var usersList = $('#users-list');
    var peerInput = $('#peer');
    var newUser;
    usersList.empty();

    for (var i = 0; i < message.users.length; i++) {
	newUser = $('<button type="button" class="list-group-item">' +
		    message.users[i] + '</button>');
	newUser.click(function (e) {
	    peerInput.val(e.target.innerHTML);
	});
	usersList.append(newUser);
    }
    
    console.log(message);
}

function resgisterResponse(message) {
console.log(message);
	if (message.response == 'accepted') {
		setRegisterState(REGISTERED);
	} else {
		setRegisterState(NOT_REGISTERED);
		var errorMessage = message.message ? message.message
				: 'Unknown reason for register rejection.';
		console.log(errorMessage);
		alert('Error registering user. See console for further information.');
	}
}

function callResponse(message) {
	if (message.response != 'accepted') {
		console.info('Call not accepted by peer. Closing call');
		var errorMessage = message.message ? message.message
				: 'Unknown reason for call rejection.';
		console.log(errorMessage);
		stop(true);
	} else {
		setCallState(IN_CALL);
		webRtcPeer.processAnswer(message.sdpAnswer);
	    webRtcPeer.videoEnabled = false;
	}
}

function startCommunication(message) {
    videoLink.hide();
    videoName.hide();
    setCallState(IN_CALL);
    webRtcPeer.processAnswer(message.sdpAnswer);
}

function incomingCall(message) {
	// If bussy just reject without disturbing user
	if (callState != NO_CALL) {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'bussy'

		};
		return sendMessage(response);
	}

    $(videoInput).show();

	setCallState(PROCESSING_CALL);
	if (confirm('User ' + message.from
			+ ' is calling you. Do you accept the call?')) {
		showSpinner(videoInput, videoOutput);

		var options = {
		    localVideo : videoInput,
		    remoteVideo : videoOutput,
		    onicecandidate : onIceCandidate,
		    mediaConstraints: {
			audio: true,
			video: {
			    width: 640,
			    framerate: 60
			    }
			}
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,
				function(error) {
					if (error) {
						console.error(error);
						setCallState(NO_CALL);
					}

					this.generateOffer(function(error, offerSdp) {
						if (error) {
							console.error(error);
							setCallState(NO_CALL);
						}
						var response = {
							id : 'incomingCallResponse',
							from : message.from,
							callResponse : 'accept',
							sdpOffer : offerSdp
						};
						sendMessage(response);
					});
				});

	} else {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'user declined'
		};
		sendMessage(response);
		stop(true);
	}
}

function register() {
	var name = document.getElementById('name').value;
	if (name == '') {
		window.alert("You must insert your user name");
		return;
	}

	setRegisterState(REGISTERING);

	var message = {
		id : 'register',
		name : name
	};
	sendMessage(message);
	document.getElementById('peer').focus();
}

function call() {
	if (document.getElementById('peer').value == '') {
		window.alert("You must specify the peer name");
		return;
	}

	setCallState(PROCESSING_CALL);
    lastCalledPeer = document.getElementById('peer').value;

	showSpinner(videoInput, videoOutput);

    $(videoOutput).show();

	var options = {
	    localVideo : videoInput,
	    remoteVideo : videoOutput,
	    onicecandidate : onIceCandidate//,
//	    mediaConstraints: {
//		audio: true,
//		video: false
//	    }
	}

	webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(
			error) {
		if (error) {
			console.error(error);
			setCallState(NO_CALL);
		}

		this.generateOffer(function(error, offerSdp) {
			if (error) {
				console.error(error);
				setCallState(NO_CALL);
			}
			var message = {
				id : 'call',
				from : document.getElementById('name').value,
				to : document.getElementById('peer').value,
				sdpOffer : offerSdp
			};
			sendMessage(message);
		});
	});
    webRtcPeer.videoEnabled = false;
    window.wrtc = webRtcPeer;

}

function stop(message) {
	setCallState(NO_CALL);
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;

		if (!message) {
			var message = {
				id : 'stop'
			}
			sendMessage(message);
		    videoName.show();
		}
	}
	hideSpinner(videoInput, videoOutput);
    $(videoInput).hide();
    $(videoOutput).hide();
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function onIceCandidate(candidate) {
	console.log('Local candidate' + JSON.stringify(candidate));

	var message = {
		id : 'onIceCandidate',
		candidate : candidate
	}
	sendMessage(message);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
