export const sendGETRequest = async (url) => {
    const options = new Object();
    options.method = "GET";
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
}

export const sendPUTRequest = async (url, data) => {
    const options = new Object();
    options.method = "PUT";
    options.headers = {"Content-type": "application/json"};
    options.body = JSON.stringify(data);
    const response = await fetch(url, options);
    return response;
}