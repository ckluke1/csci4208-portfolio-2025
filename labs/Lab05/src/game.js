const config = new Object();
config.width = 640;
config.height = 480;
config.scene = [TitleScene, PlayScene];
config.physics = { default: 'arcade' };

const game = new Phaser.Game(config);