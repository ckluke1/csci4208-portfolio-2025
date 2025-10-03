/* Hi-Lo Game Data */
const passcode = Math.floor(Math.random() * 1000);
let tries = 10;
const guess = new Guess();
let then = Date.now();
let timeLeft = 30;
let gameover = false;

/* Game Logic */
function guessNumber(guessValue) {
    tries--;
    if (guessValue == passcode) {
        gameover = true;
        printGameOver('WIN');
    } else {
        giveClue(guessValue);
    }
}

function giveClue(guessValue) {
    if (guessValue > passcode) {
        printClue('HI', guessValue);
    } else {
        printClue('LO', guessValue);
    }
}

/* Main Game Loop */
function main() {
    const now = Date.now();
    
    if (gameover) {
        return;
    } else if (timeLeft <= 0) {
        gameover = true;
        printGameOver('LOSE');
    } else if (now - then > 1000) {
        timeLeft--;
        printDigits();
        printAttemptsRemaining();
        then = Date.now();
    }
    
    requestAnimationFrame(main);
}

main();