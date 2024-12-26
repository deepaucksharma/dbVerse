export function randomIntBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export function sleep(min, max) {
    const sleepTime = randomIntBetween(min, max);
    console.log(`Sleeping for ${sleepTime} seconds`);
    return new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
}

export const departmentIds = [1, 2, 3, 4, 5, 6, 7];
export const searchQueries = [
    { name: 'John', department: 'Engineering' },
    { name: 'Mary', department: 'Sales' },
    { name: '', department: 'Research' },
    { name: 'Smith', department: '' }
];
