// Validation error occurs if an invalid request was made
// There is no point in making a repeat request
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Request errors are caused by network issues
// Requests can be repeated after network issues are fixed
class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
  }
}

// Stop errors occurs if the rules of a source of data were violated
// Stop error is a signal to stop the script
// There is no point in making other requests, as the stop error will occur again
// Requests can be repeated after violation of the rules is fixed
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
