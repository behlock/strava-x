export const REQUEST = 'REQUEST'
export const RESPONSE = 'RESPONSE'

const request = () => ({
  type: REQUEST,
})

const response = (data: any, options: any) => ({
  type: RESPONSE,
  data,
  options,
})
