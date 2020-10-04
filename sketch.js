/*
demo of using tensorflow.js and bodypix webcam masked over background video
*/

// GLOBALS
// canvases
let liveCanvas; // to render onscreen graphics
let bufferCanvas; // to buffer offscreen graphics, can act as a virtual visual layer to draw above canvas
const canvasWidth = 640;
const canvasHeight = 480;

// VIDEO
let webcam = null;
// let videoFrame = null;
// let maskedImage = null;
// let gotMaskedImage = false;
let camMode = 'VIDEO'; // one of 'VIDEO', 'AUDIO', 'BOTH', or 'CONSTRAINTS' 
// if using constraints, then pass second parameter, like:
// let constraints = {
//     video: {
//       mandatory: {
//         minWidth: 1280,
//         minHeight: 720
//       },
//       optional: [{ maxFrameRate: 10 }]
//     },
//     audio: true
//   };
// W3C spec constraint options: http://w3c.github.io/mediacapture-main/getusermedia.html#media-track-constraints


// AI MODEL
let model = null; // the pre-trained prediction model
//let segmentation = null; // result of model prediction for detecting human body and pose

// MODEL CONFIGS
const bodyPixConfig = {
    architecture: 'MobileNetV1', // or ResNet50 requires high speed GPUs, Default: MobileNetV1
    outputStride: 16, //8 or 16. 16 is less output resolution, less accurate but faster, Default: 16
    multiplier: .75, // or 0.75, or 0.50 smaller value = smaller model, faster prediction, lower accuracy. Default 0.75
    quantBytes: 2 // or 2 or 1. 4 is highest accuracy, full model size, but slower. Default: 2
};

// 2.0 BodyPix
const segmentationConfig = {
    flipHorizontal: true, // true | false. flip camera view. Default: false
    outputStride: 16, //8 or 16. 16 is less output resolution, less accurate but faster, Default: 16
    //The values 'low', 'medium', 'high', and 'full' map to 0.25, 0.5, 0.75, and 1.0 correspondingly.
    segmentationThreshold: 0.6, // score between 0 and 1 - how confident prediction that part of a person is displayed in that pixel. Default 0.7
    // scoreThreshold: 0.05 // for pose estimation only
};

// 1.0 BodyPix
// const segmentationConfig = {
//     // flipHorizontal: true, // true | false. flip camera view. Default: false
//     outputStride: 16, // low, medium, high, full - internal resolution % input resized before inference. Default: medium
//     //The values 'low', 'medium', 'high', and 'full' map to 0.25, 0.5, 0.75, and 1.0 correspondingly.
//     segmentationThreshold: 0.6, // score between 0 and 1 - how confident prediction that part of a person is displayed in that pixel. Default 0.7
//     // scoreThreshold: 0.05 // for pose estimation only?
// };

// MASKING

// toMask
const foregroundColor = {
    r: 0,
    g: 0,
    b: 0,
    a: 0
};
const backgroundColor = {
    r: 0,
    g: 0,
    b: 0,
    a: 0
};
const drawContour = false; // draw an outline around the segmented person

// drawMask
let webcamPersonMask = null;
let bufferedMaskImage = null;
const maskOpacity = 1; // opacity when drawing the mask on top of the image
const maskBlurAmount = 5; // how many pixels to blur the mask by
const flipHorizontal = false; // whether to flip the image in case of selfie

function preload() {
    //photo = loadImage('images/colorbars.png'); 
};

// runs once
function setup() {
    pixelDensity(1); // turn off auto adjusment for display resolution
    console.log('in setup');
    // noCanvas(); // remove default P5 canvas

    // backgroundContainer = createDiv();
    // backgroundContainer.id('backgroundContainer');
    // backgroundContainer.parent('mainContainer');

    //photo.resize(640,480);

    // CREATE CANVASSES
    // Create a canvas that'll be our display
    // liveCanvas = createCanvas(canvasWidth, canvasHeight, WEBGL);
    liveCanvas = createCanvas(canvasWidth, canvasHeight);
    liveCanvas.id('liveCanvas');
    // liveCanvas.parent('mainContainer')
    // liveCanvas = document.getElementById('liveCanvas');
    console.log('liveCanvas: ' + liveCanvas);

    // Create a canvas that'll contain our segmentation
    bufferCanvas = createGraphics(canvasWidth, canvasHeight);
    bufferCanvas.id('bufferCanvas');

    //bufferCanvas.drawingContext.scale(0.5, 0.5); // experiment

    // set liveCanvas background color for effect
    //background(255, 255, 0);

    // new entry point
    makeWebCam(camMode)
        .then(myCam => {
            console.log('after makeWebcam myCam: ' + myCam);
            webcam = myCam;
            console.log('calling bodyPix.load()');
            //return bodyPix.load(0.75); // for older 1.0 BodyPix
            return bodyPix.load(bodyPixConfig); // load bodypix ai model
        })
        .then(model => {
            console.log('calling predictImage()');
            console.log('webcam: ' + webcam);
            console.log('model: ' + model);

            predictImage(webcam, model);

        })
        .catch((err) => console.error(err));

};

// loops after setup (sort of, note asyncs can still be waiting
function draw() {

    //photo.mask(image(bufferCanvas,0,0));
    //image(photo,0,0);
    //image(bufferCanvas, 0,0); 

    // set liveCanvas background color for effect
    //background(255, 255, 0);

    // off-screen buffer is maintained and drawn separately in predictImage()

};

// CAPTURE LIVE VIDEO
// promisify createCapture since P5 does only callbacks
// makeWebCam(captureMode, [captureConstraints])
// captureMode: one of 'VIDEO', 'AUDIO', 'BOTH', or 'CONSTRAINTS'
// [captureConstraints] example constraints object:
function makeWebCam(captureMode, captureConstraints) {
    console.log('makeWebCam() was just called')
    return new Promise((resolve, reject) => {
        let myWebCam;
        switch (captureMode) {
            case 'VIDEO':
                myWebCam = createCapture(VIDEO, captureReady);
                myWebCam.hide();
                myWebCam.size(640, 480);
                break;
            case 'AUDIO':
                myWebCam = createCapture(AUDIO, captureReady);
                break;
            case 'BOTH':
                myWebCam = createCapture(captureReady);
                break;
            case 'CONSTRAINTS':
                if (!captureConstraints) {
                    reject(new Error("invalid captureMode, must be one of 'VIDEO', 'AUDIO', 'BOTH', or 'CONSTRAINTS'"))
                } else {
                    myWebCam = createCapture(captureConstraints, captureReady);
                };
                break;
            default:
                reject(new Error("invalid captureMode, must be one of 'VIDEO', 'AUDIO', 'BOTH', or 'CONSTRAINTS'"));
        };

        function captureReady() {
            console.log('webcam is ready, resolving promise now');
            resolve(myWebCam);
        };

    });
};

// analyze webcam video frame to segment the persons
function predictImage(theCam, theModel) {
    console.log('in predictImage');
    //return new Promise((resolve, reject) => {
    segmentation = null;
    console.log('webcam.loadedmetadata: ' + theCam.loadedmetadata);

    if (theCam.loadedmetadata) {

        // PREP FOR SEGMENTATION
        console.log('preparing to segment image');
        const videoFrame = theCam.elt;
        console.log('videoFrame: ' + videoFrame);
        console.log('predictImage theModel: ' + theModel);
        //const img = document.getElementById("webcam");

        // DO SEGMENTATION AND PAINT KEYED PERSON(S)
        theModel.segmentPerson(videoFrame, segmentationConfig)
        //theModel.estimatePersonSegmentation(videoFrame, 16, 0.6) // RETURNS A PROMISE
            .then(segmentation => {
                console.log('finished segmenting');
                console.log('segmentation: ' + segmentation);

                if (segmentation != null) {
                    drawBody(segmentation);
                    // tfMaskAndDraw(segmentation);
                }

                function drawBody(personSegmentation) {
                    console.log('in drawBody() making transparency');
                    console.log('type of videoFrame: ' + typeof videoFrame);
                    contextPerson = liveCanvas.drawingContext;
                    // contextPerson = liveCanvas.getContext('2d');
                    contextBuffer = bufferCanvas.drawingContext;
                    //contextPerson.clearRect(0,0,canvasWidth, canvasHeight);
                    contextBuffer.drawImage(videoFrame, 0, 0, canvasWidth, canvasHeight); // this is how to produce an ImageData object
                    //image(videoFrame, 0, 0, canvasWidth, canvasHeight);
                    let imageData = contextBuffer.getImageData(0, 0, canvasWidth, canvasHeight); // this is how we get the ImageData object
                    let pixel = imageData.data;
                    for (let p = 0; p < pixel.length; p += 4) {
                        if (personSegmentation.data[p / 4] == 0) {
                            pixel[p + 3] = 0;
                        }
                    }

                    //return imageData;
                    contextPerson.imageSmoothingQuality = 'high';
                    contextPerson.imageSmoothingEnabled = true;
                    contextPerson.putImageData(imageData, 0, 0);
                };

                function tfMaskAndDraw(personSegmentation) {

                    console.log('creating mask');
                    // create mask
                    webcamPersonMask = bodyPix.toMask(
                        personSegmentation,
                        foregroundColor,
                        backgroundColor,
                        drawContour
                    );
                    console.log('webcamPersonMask: ' + webcamPersonMask);

                    console.log('drawing to bufferCanvas');
                    // draw mask into buffer
                    bufferedMaskImage = bodyPix.drawMask(
                        bufferCanvas.elt,
                        // liveCanvas.elt,
                        videoFrame,
                        //myImageData,
                        webcamPersonMask,
                        maskOpacity,
                        maskBlurAmount,
                        flipHorizontal
                    );
                    console.log('bufferedMaskImage: ' + bufferedMaskImage);

                    //image(bufferCanvas, -(canvasWidth/2), -(canvasHeight/2)); // if liveCanvas is WEBGL, origin is center and not upper left
                    image(bufferCanvas, 0, 0);
                };

                // LOOP TO PREDICT NEXT SEGMENTATION
                predictImage(theCam, theModel);

            }); // end of THEN

    };

};