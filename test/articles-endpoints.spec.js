//for testing the articles endpoints

const {expect} = require('chai')
const knex = require('knex')
const app = require('../src/app')
const { makeArticlesArray, makeMaliciousArticle } = require('./articles.fixtures')
const { maliciousArticle, expectedArticle } = makeMaliciousArticle()
const { makeUsersArray } = require('./users.fixtures')

//Optional: you can add .only (describe.only) so we're only running this test file whilst working on it
describe('Articles Endpoints', function() {
    let db
    
    before('make knex instance', () => {
        db = knex({
            client: 'pg',
            connection: process.env.TEST_DB_URL,
        })
        app.set('db', db)
    })

    after('disconnect from db', () => db.destroy())

    
    //to execute arbitrary SQL with knex use the raw() method
    before('clean the table', () => db.raw('TRUNCATE blogful_articles, blogful_users, blogful_comments RESTART IDENTITY CASCADE'))
    //before('clean the table', () => db('blogful_articles').truncate()) /* removed */ 


    afterEach('cleanup',() => db.raw('TRUNCATE blogful_articles, blogful_users, blogful_comments RESTART IDENTITY CASCADE'))
    //afterEach('cleanup', () => db('blogful_articles').truncate()) /* removed */ 


    //------------------------------------------------------------------------------------ // `GET /api/articles` 
    describe(`GET /api/articles`, () => {
       context(`Given no articles`, () => {
            it(`responds with 200 and an empty list`, () => {
            return supertest(app)
                .get('/api/articles')
                .expect(200, [])
            })
        })//end context `Given no articles`

        context('Given there are articles in the database', () => {
            const testUsers = makeUsersArray()
            const testArticles = makeArticlesArray()

            beforeEach('insert articles', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert(testArticles)
                    })
            })

            it('responds with 200 and all of the articles', () => {
                return supertest(app)
                    .get('/api/articles')
                    .expect(200, testArticles) //with supertest, the 2nd arg to expect can be the res body that we expect
            })
        }) //end context 'Given there are articles in the database'
        
        context('Given it includes an XSS attack article', () => {
            const testUsers = makeUsersArray()

            beforeEach('insert malicious article', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert([maliciousArticle])
                    })
            })

            it('removes XSS attack content', () => {
                return supertest(app)
                    .get(`/api/articles/`)
                    .expect(200)
                    .expect(res => {
                        expect(res.body[0].title).to.eql(expectedArticle.title);
                        expect(res.body[0].content).to.eql(expectedArticle.content);
                                
                    })
            })
        })

    }) //end describe `GET /api/articles`    

    //------------------------------------------------------------------------------------ // `GET /api/articles/:article_id` 
    describe(`GET /api/articles/:article_id`, () => {
        context(`Given no articles`, () => {
            it(`responds with 404`, () => {
            const articleId = 123456
            return supertest(app)
                .get(`/api/articles/${articleId}`)
                .expect(404, { error: { message: `Article doesn't exist` } })
            })
        })//end context `Given no articles`
  
        context('Given there are articles in the database', () => {
            const testUsers = makeUsersArray()
            const testArticles = makeArticlesArray()

            beforeEach('insert articles', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert(testArticles)
                    })
            })

            it('responds with 200 and the specified article', () => {
                const articleId = 2
                const expectedArticle = testArticles[articleId - 1]
                return supertest(app)
                    .get(`/api/articles/${articleId}`)
                    .expect(200, expectedArticle)
            })
        })//end context 'Given there are articles in the database'

        context('Given an XSS attack article', () => {
            const testUsers = makeUsersArray()

            beforeEach('insert malicious article', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert([ maliciousArticle ])
                    })
            })
            it('removes XSS attack content', () => {
                return supertest(app)
                    .get(`/api/articles/${maliciousArticle.id}`)
                    .expect(200)
                    .expect(res => {
                        expect(res.body.title).to.eql(expectedArticle.title);
                        expect(res.body.content).to.eql(expectedArticle.content);
                    })
            })
        })

    })//end describe `GET /api/articles/:article:id`

    // ------------------------------------------------------------------------------------------------ // `POST /api/articles`
    //Optional: you can add .only (describe.only) so we're only running this test file whilst working on it
    describe(`POST /api/articles`, () => {
        const testUsers = makeUsersArray()
        
        beforeEach('insert malicious article', () => {
            return db
                .into('blogful_users')
                .insert(testUsers)
        })

        it('creates an article, responding with 201 and the new article', function(){
            this.retries(3) //specifies how many times to attempt the test before counting it as failure
            const newArticle = {
                title: 'Test new article',
                style: 'Listicle',
                content: 'Test new article content ...'
            }
            return supertest(app)
                .post('/api/articles')
                //send() - to set the body of the request
                .send(newArticle)
                .expect(201)
                .expect(res => {
                    expect(res.body.title).to.eql(newArticle.title)
                    expect(res.body.style).to.eql(newArticle.style)
                    expect(res.body.content).to.eql(newArticle.content)
                    expect(res.body).to.have.property('id')
                    expect(res.headers.location).to.eql(`/api/articles/${res.body.id}`)
                    const expected = new Date().toLocaleString()
                    const actual = new Date(res.body.date_published).toLocaleString()
                    expect(actual).to.eql(expected)
                })
                .then(postRes => 
                    supertest(app)
                        .get(`/api/articles/${postRes.body.id}`)
                        .expect(postRes.body)
                )
        })

        const requiredFields = ['title', 'content', 'style']

        requiredFields.forEach(field => {
            const newArticle = {
                title: 'Test new article',
                style: 'Listicle',
                content: 'Test new article content...'
            }

            it(`responds with 400 and an error message when the ${field} is missing`, () => {
                delete newArticle[field]

                return supertest(app)
                    .post('/api/articles')
                    .send(newArticle)
                    .expect(400, {
                        error: { message: `Missing '${field}' in request body`}
                    })
            })
        })
        
        it('removes XSS attack content from response', () => {
            return supertest(app)
                .post('/api/articles')
                .send(maliciousArticle)
                .expect(201)
                .expect(res => {
                    expect(res.body.title).to.eql(expectedArticle.title)
                    expect(res.body.content).to.eql(expectedArticle.content)
                })
        })
        

    })//end describe `POST /api/articles`

    // ------------------------------------------------------------------------------------ // `DELETE /api/articles/:article_id`
    describe(`DELETE /api/articles/:article_id`, () => {
        context('Given no articles', () => {
            it(`responds with 404`, () => {
                const articleId = 123456
                return supertest(app)
                    .delete(`/api/articles/${articleId}`)
                    .expect(404, {error: {message: `Article doesn't exist`}})
            })
        })
        
        
        context('Given there are articles in the database', () => {
            const testUsers = makeUsersArray()
            const testArticles = makeArticlesArray()

            beforeEach('insert articles', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert(testArticles)
                    })
            })

            it('responds with 204 and removes the article', () => {
                const idToRemove = 2
                const expectedArticles = testArticles.filter(article => article.id !== idToRemove)
                return supertest(app)
                    .delete(`/api/articles/${idToRemove}`)
                    .expect(204)
                    .then(res => 
                        supertest(app)
                            .get(`/api/articles`)
                            .expect(expectedArticles)
                    )
            })
        }) //end context 'Given there are articles in the database'
    })//end describe `DELETE /api/articles/:article_id

    // ------------------------------------------------------------------------------------ // `PATCH /api/articles/:article_id`
    describe(`PATCH /api/articles/:article_id`, () => {
          context(`Given no articles`, () => {
            it(`responds with 404`, () => {
              const articleId = 123456
              return supertest(app)
                .patch(`/api/articles/${articleId}`)
                .expect(404, { error: { message: `Article doesn't exist` } })
            })
          })

          context('Given there are articles in the database', () => {
            const testUsers = makeUsersArray()
            const testArticles = makeArticlesArray()
      
            beforeEach('insert articles', () => {
                return db
                    .into('blogful_users')
                    .insert(testUsers)
                    .then(() => {
                        return db
                            .into('blogful_articles')
                            .insert(testArticles)
                    })
            })
      
            it('responds with 204 and updates the article', () => {
              const idToUpdate = 2
              const updateArticle = {
                title: 'updated article title',
                style: 'Interview',
                content: 'updated article content',
              }
              const expectedArticle = {
                  ...testArticles[idToUpdate - 1],
                  ...updateArticle
              }
              return supertest(app)
                .patch(`/api/articles/${idToUpdate}`)
                .send(updateArticle)
                .expect(204)
                .then(res => 
                    supertest(app)
                        .get(`/api/articles/${idToUpdate}`)
                        .expect(expectedArticle)
                )
            })

            it(`responds with 400 when no required fields supplied`, () => {
                  const idToUpdate = 2
                  return supertest(app)
                    .patch(`/api/articles/${idToUpdate}`)
                    .send({ irrelevantField: 'foo' })
                    .expect(400, {
                      error: {
                        message: `Request body must contain either 'title', 'style' or 'content'`
                      }
                    })
            })

            it(`responds with 204 when updating only a subset of fields`, () => {
                  const idToUpdate = 2
                  const updateArticle = {
                    title: 'updated article title',
                  }
                  const expectedArticle = {
                    ...testArticles[idToUpdate - 1],
                    ...updateArticle
                  }
            
                  return supertest(app)
                    .patch(`/api/articles/${idToUpdate}`)
                    .send({
                      ...updateArticle,
                      fieldToIgnore: 'should not be in GET response'
                    })
                    .expect(204)
                    .then(res =>
                      supertest(app)
                        .get(`/api/articles/${idToUpdate}`)
                        .expect(expectedArticle)
                    )
                })
          })//end context'Given there are articles in the database'
    
    })//end describe `PATCH /api/articles/:article_id`


}) //end describe 'Articles Endpoints'