class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
  }
}

class StopError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StopError';
  }
}

module.exports = {
  ValidationError,
  RequestError,
  StopError,
};
