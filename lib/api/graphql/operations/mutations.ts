/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createStory = /* GraphQL */ `
  mutation CreateStory($prompt: String!) {
    createStory(prompt: $prompt) {
      id
      isComplete
      createdAt
      updatedAt
      text
    }
  }
`;
export const publish = /* GraphQL */ `
  mutation Publish($data: AWSJSON) {
    publish(data: $data)
  }
`;
