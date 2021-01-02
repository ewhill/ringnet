
class NoSuchFileError extends Error {
  constructor(message) {
    super(message); 
    this.name = "NoSuchFile";
  }
}

module.exports = NoSuchFileError;