/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type Story = {
  __typename: "Story",
  id: string,
  isComplete: boolean,
  createdAt: string,
  updatedAt: string,
  text: string,
};

export type CreateStoryMutationVariables = {
  prompt: string,
};

export type CreateStoryMutation = {
  createStory?:  {
    __typename: "Story",
    id: string,
    isComplete: boolean,
    createdAt: string,
    updatedAt: string,
    text: string,
  } | null,
};

export type PublishMutationVariables = {
  data?: string | null,
};

export type PublishMutation = {
  publish?: string | null,
};

export type ListStoriesQuery = {
  listStories?:  Array< {
    __typename: "Story",
    id: string,
    isComplete: boolean,
    createdAt: string,
    updatedAt: string,
    text: string,
  } | null > | null,
};

export type SubscribeSubscription = {
  subscribe?: string | null,
};
